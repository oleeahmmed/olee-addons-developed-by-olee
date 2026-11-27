"""Small helpers shared by the modern app addons (sales_modern, purchase_modern…).

    from odoo.addons.modern_theme.tools import local_midnight
"""
from datetime import datetime, time

import pytz


def local_midnight(day, tz=None):
    """Midnight of `day` in the user's timezone, as the naive UTC datetime Odoo stores.

    Datetime fields (date_order, date_done…) are stored in UTC: comparing them with a
    plain `datetime.combine(day, time.min)` shifts every period by the user's UTC offset
    (in Dhaka, orders made between 00:00 and 06:00 on the 1st fell in the previous month).
    """
    naive = datetime.combine(day, time.min)
    try:
        zone = pytz.timezone(tz) if tz else pytz.utc
    except pytz.UnknownTimeZoneError:
        zone = pytz.utc
    return zone.localize(naive).astimezone(pytz.utc).replace(tzinfo=None)
