/** @odoo-module ignore **/
/*
 * Modern Reports: make the printed page and the web preview match.
 *
 * In wkhtmltopdf (o_body_pdf) it replays the pagination (rows never split, the header repeats,
 * the tail stays together) and appends empty item rows until the tail (totals, payment details,
 * signatures) ends at the bottom of the last page.
 *
 * In the web preview (o_body_html) it draws an A4 sheet with the paper margins and pads the item
 * table down to the same bottom edge, so the preview looks like the print.
 *
 * Plain ES5: wkhtmltopdf's QtWebKit predates ES2015.
 */
(function () {
    'use strict';

    var SAFETY = 8;      // px kept free above the page bottom (rounding of the page break engine)
    var ROW = 26;        // height of one empty row, px
    var MM = 96 / 25.4;  // CSS px per mm: the paper format disables smart shrinking
    var MAX_ROWS = 500;

    function num(article, name) {
        return parseFloat(article.getAttribute(name)) || 0;
    }

    function addRow(tbody, columns) {
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

    // ---- wkhtmltopdf: replay the pagination, fill the last page -------------------------

    function docTop(element) {
        return element.getBoundingClientRect().top + (window.pageYOffset || 0);
    }

    function itemTable(article) {
        var table = article.querySelector('.o_mr_items');
        return {
            table: table,
            tbody: table && table.tBodies[0],
            thead: table && table.tHead,
            tail: article.querySelector('.o_mr_tail'),
        };
    }

    function fillPdf(article) {
        var parts = itemTable(article);
        if (!parts.tbody || !parts.tail) {
            return;
        }
        var theadHeight = parts.thead ? parts.thead.getBoundingClientRect().height : 0;
        var columns = parseInt(article.getAttribute('data-mr-cols'), 10) || 1;
        var pageHeight = num(article, 'data-mr-page-h') * MM;

        // Where the tail ends once paginated: {page: index of its page, room: free px below it}.
        function simulate() {
            var shift = 0;
            var page = Math.floor(docTop(article) / pageHeight);
            var pageEnd = (page + 1) * pageHeight;
            var rows = parts.tbody.rows;
            for (var i = 0; i < rows.length; i++) {
                var rowHeight = rows[i].getBoundingClientRect().height;
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
            var tailHeight = parts.tail.getBoundingClientRect().height;
            var tailTop = docTop(parts.tail) + shift;
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

        var state = simulate();
        var page = state.page;
        for (var n = 0; n < MAX_ROWS && state.room >= ROW; n++) {
            var row = addRow(parts.tbody, columns);
            var next = simulate();
            if (next.page !== page || next.room < 0) {
                parts.tbody.removeChild(row);
                break;
            }
            state = next;
        }
        var spacer = parts.tail.querySelector('.o_mr_spacer');
        if (spacer && state.room > 0) {
            spacer.style.height = Math.floor(state.room) + 'px';
            var after = simulate();
            if (after.page !== page || after.room < 0) {
                spacer.style.height = '0px';
            }
        }
    }

    // ---- web preview: draw the A4 sheet, fill it like the print -------------------------

    function preview(article, footer) {
        var pageWidth = num(article, 'data-mr-page-w');
        var pageHeight = num(article, 'data-mr-page-h');
        if (!pageWidth || !pageHeight) {
            return;
        }
        var top = num(article, 'data-mr-margin-t');
        var bottom = num(article, 'data-mr-margin-b');
        var left = num(article, 'data-mr-margin-l');
        var right = num(article, 'data-mr-margin-r');

        article.style.boxSizing = 'border-box';
        article.style.width = (pageWidth + left + right) + 'mm';
        article.style.minHeight = (pageHeight + top + bottom) + 'mm';
        article.style.padding = top + 'mm ' + right + 'mm ' + bottom + 'mm ' + left + 'mm';
        article.style.marginLeft = 'auto';
        article.style.marginRight = 'auto';
        article.style.position = 'relative';

        // the footer sits in the bottom margin, like wkhtmltopdf's --footer-html
        if (footer && !article.contains(footer)) {
            article.appendChild(footer);
            footer.style.position = 'absolute';
            footer.style.left = left + 'mm';
            footer.style.right = right + 'mm';
            footer.style.bottom = (bottom * 0.35) + 'mm';
        }

        if (article.getAttribute('data-mr-fill') !== '1') {
            return;
        }
        var parts = itemTable(article);
        if (!parts.tbody || !parts.tail) {
            return;
        }
        var columns = parseInt(article.getAttribute('data-mr-cols'), 10) || 1;
        var contentTop = article.getBoundingClientRect().top + top * MM;
        var contentBottom = contentTop + pageHeight * MM;
        if (parts.tail.getBoundingClientRect().bottom > contentBottom) {
            // the document runs on several pages: keep the natural flow
            return;
        }
        for (var n = 0; n < MAX_ROWS; n++) {
            var row = addRow(parts.tbody, columns);
            if (parts.tail.getBoundingClientRect().bottom > contentBottom - SAFETY) {
                parts.tbody.removeChild(row);
                break;
            }
        }
    }

    // ---- harness ------------------------------------------------------------------------

    function run() {
        var articles = document.querySelectorAll('.o_mr[data-mr-fill]');
        for (var i = 0; i < articles.length; i++) {
            var article = articles[i];
            var pageWidth = num(article, 'data-mr-page-w');
            var pageHeight = num(article, 'data-mr-page-h');
            if (!pageWidth || !pageHeight) {
                continue;
            }
            if (document.body.classList.contains('o_body_html')) {
                preview(article, articles.length === 1 ? document.querySelector('.o_mr_footer') : null);
                continue;
            }
            // wkhtmltopdf only lays the page out at paper width when printing: until then the
            // viewport is 0 px wide. Lay it out at the printable width to measure it.
            var body = document.body;
            var previousWidth = body.style.width;
            body.style.width = (pageWidth * MM) + 'px';
            try {
                fillPdf(article);
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
