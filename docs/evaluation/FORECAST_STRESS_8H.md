# Synthetic streaming forecast stress comparison

Duration: 8 h per scenario. Development-fixed defaults; no tuning.
Three arms: existing adaptive-width EWMA, raw residual quantiles and a horizon-scaled experimental candidate.
This is not clinical validation or a replacement for subject-held-out evaluation.

| Scenario | Arm | Channel | Horizon (s) | Coverage | Mean width | Scored | Max retained entries |
|---|---|---|---:|---:|---:|---:|---:|
| stationary | adaptive | HR | 5 | 90.00% | 5.884 | 28761 | 8940 |
| stationary | adaptive | HR | 10 | 90.00% | 5.972 | 28751 | 8940 |
| stationary | adaptive | HR | 30 | 90.00% | 6.543 | 28711 | 8940 |
| stationary | adaptive | HR | 60 | 90.03% | 11.588 | 28651 | 8940 |
| stationary | adaptive | HR | 120 | 88.54% | 32.365 | 28531 | 8940 |
| stationary | adaptive | RESP | 5 | 90.00% | 1.961 | 28761 | 8940 |
| stationary | adaptive | RESP | 10 | 90.00% | 1.991 | 28751 | 8940 |
| stationary | adaptive | RESP | 30 | 90.00% | 2.181 | 28711 | 8940 |
| stationary | adaptive | RESP | 60 | 90.03% | 3.863 | 28651 | 8940 |
| stationary | adaptive | RESP | 120 | 88.54% | 10.788 | 28531 | 8940 |
| stationary | adaptive | SpO2 | 5 | 90.00% | 0.981 | 28761 | 8940 |
| stationary | adaptive | SpO2 | 10 | 90.00% | 0.995 | 28751 | 8940 |
| stationary | adaptive | SpO2 | 30 | 90.00% | 1.090 | 28711 | 8940 |
| stationary | adaptive | SpO2 | 60 | 90.03% | 1.931 | 28651 | 8940 |
| stationary | adaptive | SpO2 | 120 | 88.54% | 5.394 | 28531 | 8940 |
| stationary | raw quantiles | HR | 5 | 89.29% | 5.697 | 28761 | 8940 |
| stationary | raw quantiles | HR | 10 | 89.26% | 5.710 | 28751 | 8940 |
| stationary | raw quantiles | HR | 30 | 89.17% | 5.704 | 28711 | 8940 |
| stationary | raw quantiles | HR | 60 | 89.28% | 5.696 | 28651 | 8940 |
| stationary | raw quantiles | HR | 120 | 89.05% | 5.711 | 28531 | 8940 |
| stationary | raw quantiles | RESP | 5 | 89.29% | 1.899 | 28761 | 8940 |
| stationary | raw quantiles | RESP | 10 | 89.26% | 1.903 | 28751 | 8940 |
| stationary | raw quantiles | RESP | 30 | 89.17% | 1.901 | 28711 | 8940 |
| stationary | raw quantiles | RESP | 60 | 89.28% | 1.899 | 28651 | 8940 |
| stationary | raw quantiles | RESP | 120 | 89.05% | 1.904 | 28531 | 8940 |
| stationary | raw quantiles | SpO2 | 5 | 89.29% | 0.950 | 28761 | 8940 |
| stationary | raw quantiles | SpO2 | 10 | 89.26% | 0.952 | 28751 | 8940 |
| stationary | raw quantiles | SpO2 | 30 | 89.17% | 0.951 | 28711 | 8940 |
| stationary | raw quantiles | SpO2 | 60 | 89.28% | 0.949 | 28651 | 8940 |
| stationary | raw quantiles | SpO2 | 120 | 89.05% | 0.952 | 28531 | 8940 |
| stationary | horizon-scaled candidate | HR | 5 | 90.00% | 5.791 | 28761 | 8940 |
| stationary | horizon-scaled candidate | HR | 10 | 89.99% | 5.798 | 28751 | 8940 |
| stationary | horizon-scaled candidate | HR | 30 | 89.98% | 5.796 | 28711 | 8940 |
| stationary | horizon-scaled candidate | HR | 60 | 89.97% | 5.780 | 28651 | 8940 |
| stationary | horizon-scaled candidate | HR | 120 | 89.94% | 5.804 | 28531 | 8940 |
| stationary | horizon-scaled candidate | RESP | 5 | 90.00% | 1.930 | 28761 | 8940 |
| stationary | horizon-scaled candidate | RESP | 10 | 89.99% | 1.933 | 28751 | 8940 |
| stationary | horizon-scaled candidate | RESP | 30 | 89.98% | 1.932 | 28711 | 8940 |
| stationary | horizon-scaled candidate | RESP | 60 | 89.97% | 1.927 | 28651 | 8940 |
| stationary | horizon-scaled candidate | RESP | 120 | 89.94% | 1.935 | 28531 | 8940 |
| stationary | horizon-scaled candidate | SpO2 | 5 | 90.00% | 0.965 | 28761 | 8940 |
| stationary | horizon-scaled candidate | SpO2 | 10 | 89.99% | 0.966 | 28751 | 8940 |
| stationary | horizon-scaled candidate | SpO2 | 30 | 89.98% | 0.966 | 28711 | 8940 |
| stationary | horizon-scaled candidate | SpO2 | 60 | 89.97% | 0.963 | 28651 | 8940 |
| stationary | horizon-scaled candidate | SpO2 | 120 | 89.94% | 0.967 | 28531 | 8940 |
| drift | adaptive | HR | 5 | 90.00% | 5.884 | 28761 | 8940 |
| drift | adaptive | HR | 10 | 90.00% | 5.972 | 28751 | 8940 |
| drift | adaptive | HR | 30 | 90.00% | 6.543 | 28711 | 8940 |
| drift | adaptive | HR | 60 | 90.03% | 11.588 | 28651 | 8940 |
| drift | adaptive | HR | 120 | 88.54% | 32.365 | 28531 | 8940 |
| drift | adaptive | RESP | 5 | 90.00% | 1.961 | 28761 | 8940 |
| drift | adaptive | RESP | 10 | 90.00% | 1.991 | 28751 | 8940 |
| drift | adaptive | RESP | 30 | 90.00% | 2.181 | 28711 | 8940 |
| drift | adaptive | RESP | 60 | 90.03% | 3.863 | 28651 | 8940 |
| drift | adaptive | RESP | 120 | 88.54% | 10.788 | 28531 | 8940 |
| drift | adaptive | SpO2 | 5 | 90.00% | 0.981 | 28761 | 8940 |
| drift | adaptive | SpO2 | 10 | 90.00% | 0.995 | 28751 | 8940 |
| drift | adaptive | SpO2 | 30 | 90.00% | 1.090 | 28711 | 8940 |
| drift | adaptive | SpO2 | 60 | 90.03% | 1.931 | 28651 | 8940 |
| drift | adaptive | SpO2 | 120 | 88.54% | 5.394 | 28531 | 8940 |
| drift | raw quantiles | HR | 5 | 89.29% | 5.697 | 28761 | 8940 |
| drift | raw quantiles | HR | 10 | 89.26% | 5.710 | 28751 | 8940 |
| drift | raw quantiles | HR | 30 | 89.17% | 5.704 | 28711 | 8940 |
| drift | raw quantiles | HR | 60 | 89.28% | 5.696 | 28651 | 8940 |
| drift | raw quantiles | HR | 120 | 89.05% | 5.711 | 28531 | 8940 |
| drift | raw quantiles | RESP | 5 | 89.29% | 1.899 | 28761 | 8940 |
| drift | raw quantiles | RESP | 10 | 89.26% | 1.903 | 28751 | 8940 |
| drift | raw quantiles | RESP | 30 | 89.17% | 1.901 | 28711 | 8940 |
| drift | raw quantiles | RESP | 60 | 89.28% | 1.899 | 28651 | 8940 |
| drift | raw quantiles | RESP | 120 | 89.05% | 1.904 | 28531 | 8940 |
| drift | raw quantiles | SpO2 | 5 | 89.29% | 0.950 | 28761 | 8940 |
| drift | raw quantiles | SpO2 | 10 | 89.26% | 0.952 | 28751 | 8940 |
| drift | raw quantiles | SpO2 | 30 | 89.17% | 0.951 | 28711 | 8940 |
| drift | raw quantiles | SpO2 | 60 | 89.28% | 0.949 | 28651 | 8940 |
| drift | raw quantiles | SpO2 | 120 | 89.05% | 0.952 | 28531 | 8940 |
| drift | horizon-scaled candidate | HR | 5 | 90.00% | 5.791 | 28761 | 8940 |
| drift | horizon-scaled candidate | HR | 10 | 89.99% | 5.798 | 28751 | 8940 |
| drift | horizon-scaled candidate | HR | 30 | 89.98% | 5.796 | 28711 | 8940 |
| drift | horizon-scaled candidate | HR | 60 | 89.97% | 5.780 | 28651 | 8940 |
| drift | horizon-scaled candidate | HR | 120 | 89.94% | 5.804 | 28531 | 8940 |
| drift | horizon-scaled candidate | RESP | 5 | 90.00% | 1.930 | 28761 | 8940 |
| drift | horizon-scaled candidate | RESP | 10 | 89.99% | 1.933 | 28751 | 8940 |
| drift | horizon-scaled candidate | RESP | 30 | 89.98% | 1.932 | 28711 | 8940 |
| drift | horizon-scaled candidate | RESP | 60 | 89.97% | 1.927 | 28651 | 8940 |
| drift | horizon-scaled candidate | RESP | 120 | 89.94% | 1.935 | 28531 | 8940 |
| drift | horizon-scaled candidate | SpO2 | 5 | 90.00% | 0.965 | 28761 | 8940 |
| drift | horizon-scaled candidate | SpO2 | 10 | 89.99% | 0.966 | 28751 | 8940 |
| drift | horizon-scaled candidate | SpO2 | 30 | 89.98% | 0.966 | 28711 | 8940 |
| drift | horizon-scaled candidate | SpO2 | 60 | 89.97% | 0.963 | 28651 | 8940 |
| drift | horizon-scaled candidate | SpO2 | 120 | 89.94% | 0.967 | 28531 | 8940 |
| dropouts | adaptive | HR | 5 | 90.00% | 5.890 | 28449 | 8940 |
| dropouts | adaptive | HR | 10 | 90.00% | 5.982 | 28359 | 8940 |
| dropouts | adaptive | HR | 30 | 90.00% | 6.565 | 28079 | 8940 |
| dropouts | adaptive | HR | 60 | 90.03% | 11.767 | 27779 | 8940 |
| dropouts | adaptive | HR | 120 | 88.71% | 32.509 | 27179 | 8940 |
| dropouts | adaptive | RESP | 5 | 90.00% | 1.963 | 28449 | 8940 |
| dropouts | adaptive | RESP | 10 | 90.00% | 1.994 | 28359 | 8940 |
| dropouts | adaptive | RESP | 30 | 90.00% | 2.188 | 28079 | 8940 |
| dropouts | adaptive | RESP | 60 | 90.03% | 3.922 | 27779 | 8940 |
| dropouts | adaptive | RESP | 120 | 88.71% | 10.836 | 27179 | 8940 |
| dropouts | adaptive | SpO2 | 5 | 90.00% | 0.982 | 28449 | 8940 |
| dropouts | adaptive | SpO2 | 10 | 90.00% | 0.997 | 28359 | 8940 |
| dropouts | adaptive | SpO2 | 30 | 90.00% | 1.094 | 28079 | 8940 |
| dropouts | adaptive | SpO2 | 60 | 90.03% | 1.961 | 27779 | 8940 |
| dropouts | adaptive | SpO2 | 120 | 88.71% | 5.418 | 27179 | 8940 |
| dropouts | raw quantiles | HR | 5 | 89.31% | 5.697 | 28449 | 8940 |
| dropouts | raw quantiles | HR | 10 | 89.25% | 5.712 | 28359 | 8940 |
| dropouts | raw quantiles | HR | 30 | 89.31% | 5.709 | 28079 | 8940 |
| dropouts | raw quantiles | HR | 60 | 89.32% | 5.700 | 27779 | 8940 |
| dropouts | raw quantiles | HR | 120 | 89.15% | 5.716 | 27179 | 8940 |
| dropouts | raw quantiles | RESP | 5 | 89.31% | 1.899 | 28449 | 8940 |
| dropouts | raw quantiles | RESP | 10 | 89.25% | 1.904 | 28359 | 8940 |
| dropouts | raw quantiles | RESP | 30 | 89.31% | 1.903 | 28079 | 8940 |
| dropouts | raw quantiles | RESP | 60 | 89.32% | 1.900 | 27779 | 8940 |
| dropouts | raw quantiles | RESP | 120 | 89.15% | 1.905 | 27179 | 8940 |
| dropouts | raw quantiles | SpO2 | 5 | 89.31% | 0.949 | 28449 | 8940 |
| dropouts | raw quantiles | SpO2 | 10 | 89.25% | 0.952 | 28359 | 8940 |
| dropouts | raw quantiles | SpO2 | 30 | 89.31% | 0.951 | 28079 | 8940 |
| dropouts | raw quantiles | SpO2 | 60 | 89.32% | 0.950 | 27779 | 8940 |
| dropouts | raw quantiles | SpO2 | 120 | 89.15% | 0.953 | 27179 | 8940 |
| dropouts | horizon-scaled candidate | HR | 5 | 90.00% | 5.791 | 28449 | 8940 |
| dropouts | horizon-scaled candidate | HR | 10 | 89.99% | 5.805 | 28359 | 8940 |
| dropouts | horizon-scaled candidate | HR | 30 | 89.98% | 5.791 | 28079 | 8940 |
| dropouts | horizon-scaled candidate | HR | 60 | 89.96% | 5.778 | 27779 | 8940 |
| dropouts | horizon-scaled candidate | HR | 120 | 89.95% | 5.798 | 27179 | 8940 |
| dropouts | horizon-scaled candidate | RESP | 5 | 90.00% | 1.930 | 28449 | 8940 |
| dropouts | horizon-scaled candidate | RESP | 10 | 89.99% | 1.935 | 28359 | 8940 |
| dropouts | horizon-scaled candidate | RESP | 30 | 89.98% | 1.930 | 28079 | 8940 |
| dropouts | horizon-scaled candidate | RESP | 60 | 89.96% | 1.926 | 27779 | 8940 |
| dropouts | horizon-scaled candidate | RESP | 120 | 89.95% | 1.933 | 27179 | 8940 |
| dropouts | horizon-scaled candidate | SpO2 | 5 | 90.00% | 0.965 | 28449 | 8940 |
| dropouts | horizon-scaled candidate | SpO2 | 10 | 89.99% | 0.968 | 28359 | 8940 |
| dropouts | horizon-scaled candidate | SpO2 | 30 | 89.98% | 0.965 | 28079 | 8940 |
| dropouts | horizon-scaled candidate | SpO2 | 60 | 89.96% | 0.963 | 27779 | 8940 |
| dropouts | horizon-scaled candidate | SpO2 | 120 | 89.95% | 0.966 | 27179 | 8940 |
