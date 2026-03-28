# Sky Crane Touchdown Tethers Design

## Overview

This change adds a clearer sky crane silhouette to the existing descent. The rover remains the focus, but the descent stage and four tethers are visible through descent, then release immediately after wheel contact.

## Goals

- Make the descent read clearly as a suspended sky crane landing from the moment the rover is visible.
- Keep the implementation lightweight and local to the existing descent sequence.
- Favor readability from the game camera over full mission-hardware accuracy.

## Visual Contract

- The descent stage stays visible while the rover is descending.
- Four tethers connect the descent stage to the rover body throughout descent.
- The tether material should read as thick, dark, carbon-fiber-like cables rather than thin bright guide lines.
- The tethers stay taut while the rover is still airborne.
- On touchdown, the tethers go briefly slack, release, then get pulled upward with the descent stage during a short flyaway/retraction beat.
- The existing landing dust and rover deployment sequence continue after the release beat.

## Technical Approach

- Add a small touchdown-timing helper with pure functions for descent visibility and post-touchdown release timing.
- Extend `SiteScene` with a lightweight descent-stage group and four thicker mesh-based tether visuals.
- Drive tether tension, visibility, and flyaway timing from the existing descent state instead of adding a new scene-wide state machine.

## Non-Goals

- No full rope physics simulation.
- No persistent descent stage after the touchdown beat.
- No change to the existing rover deployment animation beyond sequencing around the tether release.
