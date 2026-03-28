# Achievements HUD

On the Martian site navbar, to the **left** of the Science Points control:

- **Trophy (🏆) + `unlocked/total`** — opens [`AchievementsDialog.vue`](../src/components/AchievementsDialog.vue), listing all entries from [`public/data/achievements.json`](../public/data/achievements.json) with locked vs unlocked state.

Unlock state is tracked in [`MartianSiteView.vue`](../src/views/MartianSiteView.vue) as `unlockedAchievementIds` (session-scoped).

- **LIBS calibration** — unlock when `totalSP` crosses each threshold.
- **DAN prospecting** — unlock when `triggerDanAchievement` runs for the matching event.
- **Mars survival** — unlock when mission [`marsSol`](../src/views/MartianSiteView.vue) reaches `minSol` (landing starts at Sol 1; each full sol advance increments `marsSol`). Rewards use [`awardSurvival`](../src/composables/useSciencePoints.ts) with tiered `spReward` in [`achievements.json`](../public/data/achievements.json) under `mars-survival` (milestones at 1 / 5 / 10 / 50 / 100 full sols survived: Sol 2, 6, 11, 51, 101).

Banner toasts still use [`AchievementBanner.vue`](../src/components/AchievementBanner.vue).
