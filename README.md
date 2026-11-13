# Smart Parking – Tec de Monterrey (Lab 3)

Simulated IoT smart-parking dashboard for the Tec de Monterrey Querétaro lot. Built with plain HTML, CSS and JavaScript.

## Features
- Satellite image of the lot with 198 parking spaces overlaid (zones A to E)
- Day clock with a time slider: watch the lot fill and empty as the day goes by (starts at 06:00)
- Occupancy follows a daily pattern driven by a Gaussian-bell model (`js/simulation.js`): quiet early morning, almost full from 09:10 to 13:00, then a slow decline
- Click (or Enter/Space) on any space to change its status
- Dashboard: total, occupied, available, occupancy %
- Live sensor feed (cars arriving and leaving)
- All data is simulated; no hardware needed

