# Development-only forecast controller comparison

No held-out subjects evaluated; no automatic selection or tuning. Lower interval score is better, within the same channel/horizon.

| Arm | Channel | Horizon | Coverage | Width | Interval score | Scored |
|---|---|---:|---:|---:|---:|---:|
| existing | HR | 5 | 90.14% | 4.148 | 5.589 | 5304 |
| existing | HR | 10 | 89.87% | 6.441 | 8.168 | 5184 |
| existing | HR | 30 | 88.50% | 15.409 | 17.566 | 4704 |
| existing | HR | 60 | 85.04% | 17.809 | 20.221 | 3984 |
| existing | HR | 120 | 72.17% | 20.495 | 28.524 | 2544 |
| existing | RESP | 5 | 91.04% | 4.676 | 6.117 | 5125 |
| existing | RESP | 10 | 90.50% | 7.082 | 9.259 | 4977 |
| existing | RESP | 30 | 87.43% | 22.454 | 26.998 | 4486 |
| existing | RESP | 60 | 84.76% | 16.391 | 18.954 | 3741 |
| existing | RESP | 120 | 68.59% | 16.252 | 24.351 | 2356 |
| existing | SpO2 | 5 | 93.10% | 1.214 | 1.829 | 5278 |
| existing | SpO2 | 10 | 92.35% | 1.819 | 2.557 | 5153 |
| existing | SpO2 | 30 | 89.94% | 3.837 | 4.619 | 4653 |
| existing | SpO2 | 60 | 82.51% | 9.049 | 10.848 | 3922 |
| existing | SpO2 | 120 | 82.32% | 3.571 | 5.299 | 2444 |
| horizon-scaled candidate | HR | 5 | 88.39% | 3.516 | 5.293 | 5304 |
| horizon-scaled candidate | HR | 10 | 86.73% | 4.425 | 6.896 | 5184 |
| horizon-scaled candidate | HR | 30 | 80.55% | 4.718 | 8.908 | 4704 |
| horizon-scaled candidate | HR | 60 | 68.70% | 4.224 | 10.922 | 3984 |
| horizon-scaled candidate | HR | 120 | 61.67% | 4.066 | 18.456 | 2544 |
| horizon-scaled candidate | RESP | 5 | 89.42% | 3.335 | 5.251 | 5125 |
| horizon-scaled candidate | RESP | 10 | 88.00% | 3.909 | 7.022 | 4977 |
| horizon-scaled candidate | RESP | 30 | 81.19% | 4.506 | 10.845 | 4486 |
| horizon-scaled candidate | RESP | 60 | 72.76% | 3.545 | 10.780 | 3741 |
| horizon-scaled candidate | RESP | 120 | 59.51% | 2.926 | 12.475 | 2356 |
| horizon-scaled candidate | SpO2 | 5 | 92.35% | 0.885 | 1.547 | 5278 |
| horizon-scaled candidate | SpO2 | 10 | 91.11% | 0.933 | 1.742 | 5153 |
| horizon-scaled candidate | SpO2 | 30 | 87.19% | 1.022 | 2.144 | 4653 |
| horizon-scaled candidate | SpO2 | 60 | 80.27% | 1.050 | 3.140 | 3922 |
| horizon-scaled candidate | SpO2 | 120 | 81.14% | 0.996 | 2.956 | 2444 |
