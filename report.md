## Performance Test Results

### Mobile
- **First Contentful Paint:** 2.6 s
- **Speed Index:** 2.6 s
- **Largest Contentful Paint:** 18.5 s
- **Time to Interactive:** 18.5 s
- **Cumulative Layout Shift:** 0

### Desktop
- **First Contentful Paint:** 2.9 s
- **Speed Index:** 2.9 s
- **Largest Contentful Paint:** 19.7 s
- **Time to Interactive:** 19.7 s
- **Cumulative Layout Shift:** 0

## Outage Resilience Test Results

### CSS Outage Simulation
Blocked all CSS files to simulate a critical resource outage.
A screenshot of the page without CSS has been saved to `outage.png`.

## Stress Stability Test Results

### Rapid Click Test
Simulated 100 rapid clicks on the login button.
**Time taken:** 3.583 seconds.
**No console errors found.**


## Class 10 Curriculum Integrity Report

| Subject | Chapter | Table ID | Status | Outcome |
| :--- | :--- | :--- | :--- | :--- |

**Audit Crash:** page.waitForSelector: Timeout 45000ms exceeded.
Call log:
[2m  - waiting for locator('#login-error:not(.hidden)') to be visible[22m
