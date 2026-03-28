# `useMartianSiteAchievements`

`src/composables/useMartianSiteAchievements.ts` loads `/data/achievements.json`, keeps reactive lists for each category (libs, DAN, survival, SAM, APXS), and registers:

- **Libs (ChemCam SP):** unlock when `chemcamSP` crosses each threshold.
- **Reward track:** unlock milestones when `totalSP` crosses SP ranges, syncs `unlockedTrackIds` and `rewardTrackPrevSP`, shows banners.
- **Modifiers:** `applyRewardTrack(trackModifiers)` when computed modifiers change.
- **Survival:** unlock by sol when `marsSol` ≥ `minSol`, awards SP via `awardSurvival`.

It also exposes `triggerDanAchievement`, `triggerSamAchievement`, and `triggerAPXSAchievement` for event-driven entries from the site controller and SAM/APXS handlers.

Cumulative APXS counters (`apxsAnalysisCount`, etc.) stay in `MartianSiteView.vue` because they depend on queue ack logic there.
