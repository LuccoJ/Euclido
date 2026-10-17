---
title: Obstacle sounds
category: Usage
order: 15
---

# Obstacle sounds (Eureka/Midea robots)

When the robot's camera detects a new obstacle during a cleanup, Euclido can play a sound named after it,
for example "Shoes!" when it sees shoes.

## Adding sounds

Put MP3 files on the robot in `/userdata/sounds/objects`, named after the obstacle as it is shown on the map:

- `Shoes.mp3` or `shoes.mp3` for "Shoes"
- `Trash can.mp3`, `trash can.mp3` or `trash_can.mp3` for "Trash can"

For example: `mkdir -p /userdata/sounds/objects` on the robot, then
`scp shoes.mp3 root@<robot IP>:/userdata/sounds/objects/`.

The list of obstacle names is in `backend/lib/robots/midea/MideaConst.js`.
A missing file simply means no sound for that obstacle.

`/oem/sound/objects` is also searched, but prefer `/userdata/sounds/objects`:
space on `/oem` is limited, and `/oem/sound` is overwritten when the vendor app updates the robot's voice pack.

## When sounds play

- Only obstacles that are new since Euclido started. The ones already on the map when it starts don't play.
- At most one sound every 3 seconds, and the same obstacle at most once every 15 seconds.
- They are played with the robot's own `mp3play.sh`, at the robot's volume.
