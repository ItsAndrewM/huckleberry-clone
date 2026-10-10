# Percentiles

The app works out a growth percentile only from WHO's Child Growth Standards for girls, from birth to day 730. `packages/domain/test/growth/who-gate.test.ts` reads WHO's own tables back through the engine for every one of those days. Percentiles stay off the screen while it fails (M4.2).

## How a percentile is worked out

1. **Age:** `ageInDays(measuredOn, birthDate)` counts whole calendar days from the birth date to the measurement's local date in the household's time zone. It is chronological age, so gestational age at birth plays no part (decided 10 Oct 2026). WHO's standards describe babies born at term, and the child was born at 281 days, 40 weeks and 1 day.
2. **L, M and S:** `girlsLms(metric, ageDays)` reads WHO's values for that day from `data/who/lms-girls.json` (M4.1).
3. **z-score:** `zScoreLMS(value, lms)` applies WHO's LMS formula, z = ((x / M)^L − 1) / (L × S), or ln(x / M) / S when L is 0. Beyond ±3 it follows WHO's restricted application: past 3 SD, each further SD is as wide as the step from 2 SD to 3 SD. Only weight's L differs from 1, so only weight's z-scores change.
4. **Percentile:** `percentile(z)` is 100 × Φ(z), the standard normal distribution, from Marsaglia's series. Beyond ±8 it answers 0 or 100, which is within 1e-13 points.

`zScoreFor(metric, sex, ageDays, value)` and `percentileFor` run these steps. They take a measurement in the unit growth records store: grams for weight, and centimetres for length and head circumference. A weight is divided by 1,000 into WHO's kilograms.

## When there is no percentile

`percentileFor` answers `"unavailable"`, which the app shows as "Percentile unavailable", for:

- a boy, since only girls' tables are bundled
- an age that isn't a whole day from 0 to 730, such as a two-year visit on day 731 after a 29 February
- a measurement that isn't a positive number

## The gate

| Check, on every day from 0 to 730 | Tolerance | Worst seen |
| --- | --- | --- |
| WHO's P3, P15, P50, P85 and P97, through `percentileFor` | ±0.5 percentile points | 0.042: weight, P50, day 3 |
| WHO's SD4neg to SD4, through `zScoreFor` | ±0.002 in z | 0.0014: weight, SD3neg, day 7 |

- **±0.5 points** is the implementation plan's bar. WHO prints every value to three decimals, so its P3 read back lands near 3, not on it.
- **±0.002 in z** is the tight check. It absorbs that rounding, yet it fails a table read one day out of step. Reading the next day's L, M and S misses it in every SD column but SD0, on every day, by at least 0.0022 (head circumference, SD4, day 723).
- **SD4 and SD4neg test the restricted application.** WHO's values for them are its restricted ones. Without the restriction, weight's SD4neg misses by up to 0.17 (day 728).

## Sources

- WHO Multicentre Growth Reference Study Group, [WHO Child Growth Standards: length/height-for-age, weight-for-age, weight-for-length, weight-for-height and body mass index-for-age: methods and development](https://www.who.int/publications/i/item/924154693X), WHO, 2006. The LMS method, and its restricted application beyond ±3 SD.
- George Marsaglia, [Evaluating the Normal Distribution](https://www.jstatsoft.org/article/view/v011i04), Journal of Statistical Software 11(4), 2004.
- `packages/domain/data/who/MANIFEST.json`: the six WHO workbooks the tables come from (M4.1).
