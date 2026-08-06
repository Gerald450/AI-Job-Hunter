"""Compiled sponsorship phrase patterns.

NO patterns are checked before YES patterns so denials that contain
affirmative substrings (e.g. ``no sponsorship available``) resolve correctly.
"""

from __future__ import annotations

import re

# Explicit denials / authorization requirements (order within list is irrelevant).
_NO_SPONSORSHIP_RAW: tuple[str, ...] = (
    r"no\s+visa\s+sponsorship",
    r"no\s+immigration\s+sponsorship",
    r"no\s+h-?1b\s+sponsorship",
    r"no\s+sponsorship",
    r"visa\s+sponsorship\s+is\s+not\s+available",
    r"this\s+position\s+is\s+not\s+eligible\s+for\s+visa\s+sponsorship",
    r"not\s+eligible\s+for\s+(?:employment\s+|visa\s+|immigration\s+)?sponsorship",
    r"employer\s+will\s+not\s+sponsor",
    r"will\s+not\s+sponsor",
    r"won'?t\s+sponsor",
    r"wont\s+sponsor",
    r"cannot\s+sponsor",
    r"can\s+not\s+sponsor",
    r"unable\s+to\s+sponsor",
    r"not\s+able\s+to\s+sponsor",
    r"does\s+not\s+sponsor",
    r"doesn't\s+sponsor",
    r"sponsorship\s+is\s+unavailable",
    r"sponsorship\s+(?:is\s+)?not\s+available",
    r"must\s+be\s+legally\s+authorized\s+to\s+work",
    r"must\s+have\s+unrestricted\s+work\s+authorization",
    r"must\s+possess\s+unrestricted\s+work\s+authorization",
    r"must\s+be\s+authorized\s+to\s+work\s+in\s+the\s+united\s+states\s+without\s+sponsorship",
    r"authorized\s+to\s+work\s+(?:in\s+the\s+)?(?:u\.?s\.?a?\.?|united\s+states)\s+without\s+sponsorship",
    r"no\s+visa\s+support",
    r"u\.?s\.?\s+work\s+authorization\s+required",
    r"us\s+work\s+authorization\s+required",
    r"must\s+(?:already\s+)?be\s+authorized\s+to\s+work",
    r"not\s+.*\s+eligible\s+.*\s+visa\s+sponsorship",
)

# Explicit offers of sponsorship.
_YES_SPONSORSHIP_RAW: tuple[str, ...] = (
    r"visa\s+sponsorship\s+available",
    r"h-?1b\s+sponsorship\s+available",
    r"employment\s+sponsorship\s+available",
    r"immigration\s+sponsorship\s+available",
    r"we\s+sponsor\s+visas?",
    r"we\s+provide\s+visa\s+sponsorship",
    r"we\s+support\s+work\s+authorization\s+sponsorship",
    r"eligible\s+for\s+(?:visa\s+|employment\s+|immigration\s+)?sponsorship",
    r"sponsorship\s+available",
    r"will\s+sponsor",
    r"sponsors?\s+(?:h-?1b|visas?|work\s+visas?)",
)


def _compile_all(raw_patterns: tuple[str, ...]) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(pattern) for pattern in raw_patterns)


NO_SPONSORSHIP_PATTERNS: tuple[re.Pattern[str], ...] = _compile_all(_NO_SPONSORSHIP_RAW)
YES_SPONSORSHIP_PATTERNS: tuple[re.Pattern[str], ...] = _compile_all(_YES_SPONSORSHIP_RAW)
