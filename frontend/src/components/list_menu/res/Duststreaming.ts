export const DuststreamingLecture = `
Camera streaming lets you see live through the robot's camera, from anywhere on your network.

Please use it with respect for other people's privacy:

- Let the people who live with you or visit you know that the robot can stream video, and ask them before you use it.
- Depending on where you live, recording people without their knowledge or consent may be illegal. Make sure you comply with the laws that apply to you.
- Turn it off again when you don't need it.
`;

export const DuststreamingInstallInstructions = (binaryPath: string | undefined): string => {
    return `
The camera streaming itself is done by a separate program, [duststreamer](https://github.com/hypfer/duststreamer),
which isn't included and has to be put on the robot once.

1. Download the duststreamer binary for your robot's CPU from the [duststreamer releases](https://github.com/hypfer/duststreamer/releases).
   Robots like the Eureka J15 series need the \`aarch64\` one.
2. Copy it onto the robot as \`${binaryPath}\`, for example with
   \`scp duststreamer root@<robot IP>:${binaryPath}\`.
3. Make it executable on the robot with \`chmod +x ${binaryPath}\`.
4. Come back here and refresh the page.

To make camera streaming impossible again, simply delete that file.
`;
};
