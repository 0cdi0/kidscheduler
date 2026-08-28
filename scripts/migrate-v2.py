#!/usr/bin/env python3
"""
One-off migration of server/data/schedule.json from the v1 shape (holiday /
schoolBreak / birthdays baked into each day) to v2: holidays and school
breaks become their own overlay collections, birthdays live on kids/people
as recurring MM-DD fields, and school years / appointments / settings are
introduced. Run once: python3 scripts/migrate-v2.py
"""
import json
import sys

PATH = "server/data/schedule.json"

# Corrections/enrichment the user gave us directly, overriding the sheet.
KID_BIRTHDAYS = {
    "philipp": "02-04",
    "johannes": "10-28",  # user-confirmed; sheet said 10-27
    "aleks": "10-10",
    "luis": "03-02",
}

PEOPLE = [
    {"id": "sabine", "name": "Sabine", "birthday": "12-21", "note": "im Entwurf mit Fragezeichen"},
    {"id": "sasa", "name": "Saša", "birthday": "01-25", "note": None},
    {"id": "henry", "name": "Henry", "birthday": "05-13", "note": None},
    {"id": "chris", "name": "Chris", "birthday": "07-03", "note": "mit Fragezeichen beim Betreuungsvermerk"},
    {"id": "steffi", "name": "Steffi", "birthday": "08-07", "note": "Geb.feier am 08.08."},
]

GROUPS = [
    {"id": "dad", "label": "Philipp & Johannes", "otherParentLabel": "Mother"},
    {"id": "mom", "label": "Aleks & Luis", "otherParentLabel": "Father"},
]


def main():
    with open(PATH, encoding="utf-8") as f:
        old = json.load(f)

    if "schoolYears" in old:
        print("Already migrated (schoolYears present) - doing nothing.")
        return

    kids = []
    for k in old["kids"]:
        kids.append({
            "id": k["id"],
            "name": k["name"],
            "group": k["group"],
            "color": k["color"],
            "birthday": KID_BIRTHDAYS.get(k["id"]),
            "active": True,
        })

    people = [{**p, "active": True} for p in PEOPLE]

    holidays = []
    school_break_days = {}  # label -> sorted list of iso dates
    days_out = {}

    for iso in sorted(old["days"].keys()):
        day = old["days"][iso]
        if day.get("holiday"):
            holidays.append({"date": iso, "label": day["holiday"], "source": "import"})
        if day.get("schoolBreak"):
            school_break_days.setdefault(day["schoolBreak"], []).append(iso)
        days_out[iso] = {
            "kids": day.get("kids", {}),
            "notes": day.get("notes"),
        }

    # Collapse each label's sorted dates into contiguous [start, end] ranges.
    school_breaks = []
    for label, isos in school_break_days.items():
        isos = sorted(isos)
        range_start = isos[0]
        prev = isos[0]
        for iso in isos[1:]:
            from datetime import date
            gap = (date.fromisoformat(iso) - date.fromisoformat(prev)).days
            if gap > 1:
                school_breaks.append({"id": f"{label}-{range_start}", "label": label, "start": range_start, "end": prev})
                range_start = iso
            prev = iso
        school_breaks.append({"id": f"{label}-{range_start}", "label": label, "start": range_start, "end": prev})

    new = {
        "meta": old["meta"],
        "schoolYears": [
            {
                "id": "2026-27",
                "label": old["meta"]["schoolYear"],
                "start": old["meta"]["start"],
                "end": old["meta"]["end"],
                "locked": False,
            }
        ],
        "groups": GROUPS,
        "kids": kids,
        "people": people,
        "days": days_out,
        "holidays": holidays,
        "schoolBreaks": school_breaks,
        "appointments": [],
        "settings": {
            "publicHolidaySync": {
                "country": "AT",
                "subdivision": "AT-9",
                "lastSyncedYear": None,
                "lastSyncedAt": None,
            }
        },
    }

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(new, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Migrated. {len(holidays)} holidays, {len(school_breaks)} school-break ranges, {len(kids)} kids, {len(people)} people.")


if __name__ == "__main__":
    main()
