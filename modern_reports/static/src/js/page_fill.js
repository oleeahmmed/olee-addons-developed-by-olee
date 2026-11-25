/** @odoo-module ignore **/
/*
 * Modern Reports: fill the last page of every printed document.
 *
 * Runs inside wkhtmltopdf only (web.report_assets_pdf). For each `.o_mr` article it replays
 * wkhtmltopdf's pagination (rows never split, the table header repeats on every page, the tail
 * is kept together), then appends empty item rows until the tail (totals, payment details,
 * signatures) ends at the bottom of the last page. The remainder smaller than one row goes into
 * `.o_mr_spacer` (above the signature lines).
 *
 * Plain ES5: wkhtmltopdf's QtWebKit predates ES2015.
 */
(function () {
    'use strict';

    var SAFETY = 8;      // px kept free above the page bottom (rounding of the page break engine)
    var ROW = 26;        // height of one empty row, px

    function docTop(element) {
        return element.getBoundingClientRect().top + (window.pageYOffset || 0);
    }

    function height(element) {
        return element.getBoundingClientRect().height;
    }

    function fillArticle(article, pageHeight) {
        var table = article.querySelector('.o_mr_items');
        var tbody = table && table.tBodies[0];
        var tail = article.querySelector('.o_mr_tail');
        if (!tbody || !tail) {
            return;
        }
        var thead = table.tHead;
        var theadHeight = thead ? height(thead) : 0;
        var columns = parseInt(article.getAttribute('data-mr-cols'), 10) || 1;

        // Where the tail ends once paginated: {page: index of its page, room: free px below it}.
        function simulate() {
            var shift = 0;
            var page = Math.floor(docTop(article) / pageHeight);
            var pageEnd = (page + 1) * pageHeight;
            var rows = tbody.rows;
            for (var i = 0; i < rows.length; i++) {
                var rowHeight = height(rows[i]);
                var top = docTop(rows[i]) + shift;
                while (top + rowHeight > pageEnd && rowHeight < pageHeight) {
                    // the row moves to the next page, below the repeated table header
                    shift += pageEnd - top + theadHeight;
                    top = pageEnd + theadHeight;
                    pageEnd += pageHeight;
                    page += 1;
                }
                while (top >= pageEnd) {
                    pageEnd += pageHeight;
                    page += 1;
                }
            }
            var tailHeight = height(tail);
            var tailTop = docTop(tail) + shift;
            while (tailTop >= pageEnd) {
                pageEnd += pageHeight;
                page += 1;
            }
            if (tailTop + tailHeight > pageEnd && tailHeight < pageHeight) {
                tailTop = pageEnd;
                pageEnd += pageHeight;
                page += 1;
            }
            return {page: page, room: pageEnd - (tailTop + tailHeight) - SAFETY};
        }

        function addRow() {
            var row = document.createElement('tr');
            row.className = 'o_mr_filler';
            for (var c = 0; c < columns; c++) {
                var cell = document.createElement('td');
                cell.innerHTML = '&#160;';
                row.appendChild(cell);
            }
            row.style.height = ROW + 'px';
            tbody.appendChild(row);
            return row;
        }

        var state = simulate();
        var page = state.page;
        for (var n = 0; n < 500 && state.room >= ROW; n++) {
            var row = addRow();
            var next = simulate();
            if (next.page !== page || next.room < 0) {
                tbody.removeChild(row);
                break;
            }
            state = next;
        }
        var spacer = tail.querySelector('.o_mr_spacer');
        if (spacer && state.room > 0) {
            spacer.style.height = Math.floor(state.room) + 'px';
            var after = simulate();
            if (after.page !== page || after.room < 0) {
                spacer.style.height = '0px';
            }
        }
    }

    function run() {
        var MM = 96 / 25.4;  // CSS px per mm: the paper format disables smart shrinking
        var articles = document.querySelectorAll('.o_mr[data-mr-fill="1"]');
        for (var i = 0; i < articles.length; i++) {
            var article = articles[i];
            var pageWidthMm = parseFloat(article.getAttribute('data-mr-page-w'));
            var pageHeightMm = parseFloat(article.getAttribute('data-mr-page-h'));
            if (!pageWidthMm || !pageHeightMm) {
                continue;
            }
            // wkhtmltopdf only lays the page out at paper width when printing: until then the
            // viewport is 0 px wide. Lay it out at the printable width to measure it.
            var body = document.body;
            var previousWidth = body.style.width;
            body.style.width = (pageWidthMm * MM) + 'px';
            try {
                fillArticle(article, pageHeightMm * MM);
            } finally {
                body.style.width = previousWidth;
            }
        }
    }

    if (document.readyState === 'complete') {
        run();
    } else {
        window.addEventListener('load', run, false);
    }
})();
