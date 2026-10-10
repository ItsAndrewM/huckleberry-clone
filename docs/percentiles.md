# Percentiles

The app works out a growth percentile only from WHO's Child Growth Standards for girls, from birth to day 730. `packages/domain/test/growth/who-gate.test.ts` reads WHO's own tables back through the engine for every one of those days. CI runs it on every pull request, and nothing in the app turns percentiles off (decided 10 Oct 2026).

## How a percentile is worked out

1. **Age:** `ageInDays(measuredOn, birthDate)` counts whole calendar days from the birth date to the measurement's local date in the household's time zone. It is chronological age, so gestational age at birth plays no part (decided 10 Oct 2026). WHO's standards describe babies born at term, and the child was born at 281 days, 40 weeks and 1 day.
2. **L, M and S:** `girlsLms(metric, ageDays)` reads WHO's values for that day from `data/who/lms-girls.json` (M4.1).
3. **z-score:** `zScoreLMS(value, lms)` applies WHO's LMS formula, z = ((x / M)^L − 1) / (L × S), or ln(x / M) / S when L is 0. Beyond ±3 it follows WHO's restricted application: past 3 SD, each further SD is as wide as the step from 2 SD to 3 SD. Only weight's L differs from 1, so only weight's z-scores change.
4. **Percentile:** `percentile(z)` is 100 × Φ(z), the standard normal distribution, from Marsaglia's series. Beyond ±8 it answers 0 or 100, which is within 1e-13 points.

`zScoreFor(metric, sex, ageDays, value)` and `percentileFor` run these steps. They take a measurement in the unit growth records store: grams for weight, and centimetres for length and head circumference. A weight is divided by 1,000 into WHO's kilograms.

## The curves on the chart

M4.5's chart draws WHO's 3rd, 15th, 50th, 85th and 97th percentiles for each day. `valueAtPercentile(metric, sex, ageDays, percentile)` works each one out from the same L, M and S:

1. **z:** the percentile's point on the standard normal distribution: ±1.8807936081512509 for the 3rd and 97th, ±1.0364333894937896 for the 15th and 85th, and 0 for the 50th.
2. **Value:** M(1 + L × S × z)^(1/L), or M × e^(S × z) when L is 0. All five curves lie inside ±3 SD, so the restricted application never applies.
3. **Unit:** the value comes back in the unit growth records store, so a weight is multiplied by 1,000 into grams.

It answers `"unavailable"` where `percentileFor` would for any value: for a boy, and for an age that isn't a whole day from 0 to 730.

## When there is no percentile

`percentileFor` answers `"unavailable"`, which the app shows as "Percentile unavailable", for:

- a boy, since only girls' tables are bundled
- an age that isn't a whole day from 0 to 730, such as a two-year visit on day 731 after a 29 February
- a measurement that isn't a positive, finite number

## The gate

| Check, on every day from 0 to 730 | Tolerance | Worst seen |
| --- | --- | --- |
| WHO's P3, P15, P50, P85 and P97, through `percentileFor` | ±0.5 percentile points | 0.042: weight, P50, day 3 |
| WHO's SD4neg to SD4, through `zScoreFor` | ±0.002 in z | 0.0014: weight, SD3neg, day 7 |
| WHO's P3, P15, P50, P85 and P97, drawn by `valueAtPercentile` | ±0.0005 in WHO's unit | 0.0005: length, P50, day 10 |

- **±0.5 points** is the implementation plan's bar. WHO prints every P and SD value to three decimals, so its P3 read back lands near 3, not on it.
- **±0.002 in z** is the tight check. It absorbs that rounding, yet it fails a table read one day out of step. Reading the next day's L, M and S puts z at least 0.0021 off in every SD column on days 0 to 729 (head circumference, SD4, day 723), and day 730 has no next day. Reading the previous day's does the same.
- **±0.0005 for the curves is WHO's own rounding.** WHO prints each P value to three decimals, so a curve drawn exactly can sit half a thousandth from it, as length's P50 does on day 10: 50.8365 cm against WHO's 50.837. Drawing from the next day's L, M and S misses by at least 0.0036 (head circumference, P97, day 716), so a curve a day out of step fails. `test/growth/curve-gate.test.ts` checks every day.
- **SD4 and SD4neg test the restricted application.** WHO's values for them are its restricted ones. Without the restriction, weight's SD4neg misses by up to 0.17 (day 728).

## Sources

- WHO Multicentre Growth Reference Study Group, [WHO Child Growth Standards: length/height-for-age, weight-for-age, weight-for-length, weight-for-height and body mass index-for-age: methods and development](https://www.who.int/publications/i/item/924154693X), WHO, 2006. The LMS method, and its restricted application beyond ±3 SD.
- George Marsaglia, [Evaluating the Normal Distribution](https://www.jstatsoft.org/article/view/v011i04), Journal of Statistical Software 11(4), 2004.
- `packages/domain/data/who/MANIFEST.json`: the six WHO workbooks the tables come from (M4.1).
