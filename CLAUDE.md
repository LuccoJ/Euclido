# Notes for Claude Code

Euclido is a fork of Valetudo, mainly for Eureka (Midea) J15 robots. The maintainer tests every change on their
Eureka J15 Pro Ultra and pushes through `https://github.com/LuccoJ/Valetudo` (the repository was renamed to Euclido).

## Pull requests

- One topic per branch and pull request, against this repository's `master`. Never open pull requests against
  Hypfer/Valetudo.
- When a pull request adds a meaningful feature or fix that Euclido has and Valetudo doesn't, add it to the
  "What Euclido adds" list in `README.md`, in its own commit in the same pull request.
- Keep documentation changes in their own commits, separate from the code.
- Pull requests are merged without squashing when they have several meaningful commits, so that fixes stay separate.
- Bring upstream changes in with a merge, never a rebase of `master`.

## Commits and code

- Commit messages are descriptive. For changes that remove or replace things specific to the original project,
  keep the wording neutral and brief.
- Don't put model names in commits or code.
- Keep changes mergeable with upstream: new code in new files where possible, small hooks into existing code, and no
  reformatting or renaming of upstream code.
- Before pushing, run the same checks as CI: `npm run lint` and `npm run ts-check` for the frontend and backend
  workspaces, and `npm test --workspace=backend`. Generated files such as
  `backend/lib/robots/midea/generated/midea_protobufs.js` are excluded from linting, so lint individual files or
  the workspaces, not whole directories.

## Robot safety (Midea)

- Never send the commands on the do-not-send list kept with the firmware notes. Among them are the resets,
  factory, test and exhibition modes, 0x25 (auto-segmentation, overwrites the map), fan value 5, and the 0x9C
  toggles 0x13 and 0x1F.
- Never re-enable the vendor cloud or OTA, and never touch `/oem/midea` on the robot.
- Anything that moves the robot is tested only with the maintainer next to it.
