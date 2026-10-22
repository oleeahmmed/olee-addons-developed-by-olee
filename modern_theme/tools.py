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


# --------------------------------------------------------------------------
# Period helpers shared by the owner dashboards of the modern apps
# --------------------------------------------------------------------------
PERIODS = ('month', 'quarter', 'year')


def period_bounds(today, period):
    """(start, end, prev_start, prev_end) as dates: the period so far and the same span just before it.

    "This month" on the 17th is compared with the 1st-17th of last month, so the
    comparison is fair at any point of the period. `end` is exclusive (tomorrow).
    """
    from datetime import timedelta

    from dateutil.relativedelta import relativedelta
    from odoo.tools import date_utils

    period = period if period in PERIODS else 'month'
    start = date_utils.start_of(today, period)
    end = today + timedelta(days=1)
    step = {'month': relativedelta(months=1), 'quarter': relativedelta(months=3), 'year': relativedelta(years=1)}[period]
    prev_start = start - step
    prev_end = min(prev_start + (end - start), start)
    return start, end, prev_start, prev_end


def growth(current, previous):
    """Growth in %, None when there is nothing to compare with."""
    if not previous:
        return None
    return round((current - previous) * 100.0 / abs(previous), 1)


def month_key(value):
    """First day of the month of a date / datetime (read_group 'field:month' keys)."""
    value = value.date() if hasattr(value, 'date') else value
    return value.replace(day=1)
