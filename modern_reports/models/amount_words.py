"""Amount in words using the South-Asian numbering system (thousand, lakh, crore)."""

_ONES = (
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen',
)
_TENS = ('', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety')

LAKH_CURRENCIES = ('BDT', 'INR', 'PKR', 'NPR', 'LKR')


def _below_hundred(number):
    if number < 20:
        return _ONES[number]
    tens, ones = divmod(number, 10)
    return _TENS[tens] + ('-' + _ONES[ones] if ones else '')


def _below_thousand(number):
    hundreds, rest = divmod(number, 100)
    words = []
    if hundreds:
        words.append(_ONES[hundreds] + ' Hundred')
    if rest:
        words.append(_below_hundred(rest))
    return ' '.join(words)


def lakh_words(number):
    """Spell a non-negative integer: 140397 -> 'One Lakh Forty Thousand Three Hundred Ninety-Seven'."""
    number = int(number)
    if number == 0:
        return 'Zero'
    crore, number = divmod(number, 10_000_000)
    lakh, number = divmod(number, 100_000)
    thousand, number = divmod(number, 1000)
    words = []
    if crore:
        words.append(lakh_words(crore) + ' Crore')
    if lakh:
        words.append(_below_hundred(lakh) + ' Lakh')
    if thousand:
        words.append(_below_hundred(thousand) + ' Thousand')
    if number:
        words.append(_below_thousand(number))
    return ' '.join(words)


def lakh_amount_words(amount, unit, subunit, decimals=2):
    amount = abs(amount)
    integral, _sep, fractional = f'{amount:.{decimals}f}'.partition('.')
    text = '%s %s' % (lakh_words(int(integral)), unit)
    if fractional and int(fractional):
        text += ' and %s %s' % (lakh_words(int(fractional)), subunit)
    return text
