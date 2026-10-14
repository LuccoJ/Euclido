export const SegmentCleaningSettingsHelp = `
## Personalized room cleaning settings

These settings are stored on the robot for each room (segment).

### Order

Rooms that are part of the order are cleaned in that order. All other rooms are cleaned in whatever order
the robot finds most efficient.

The order is used whenever the robot cleans several rooms without being told otherwise, e.g. a full cleanup.
When you select rooms on the map, they are cleaned in the order you selected them in. After that cleanup,
the order set here is restored.

### Cleaning settings

Passes, mode, fan speed, water usage and route only take effect in the **Personalized** operation mode.
In every other mode, the robot uses the global settings for all rooms.

What a room is made of (its floor material) is set in the segment management instead.
`;
