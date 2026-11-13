# Collaboration guide

## Before the event

Read references, agree on responsibilities, and check generic development tools. Do not implement or prototype the challenge solution before the official opening. The team chooses its own idea; AI may assist with research, development, testing, and review subject to the event rules.

## During the event

1. Agree on a small task and create an issue with an owner.
2. Update your local `main` from GitHub.
3. Create a branch such as `feat/12-import-data`, `fix/18-missing-values`, or `docs/23-demo`.
4. Make changes, check them locally, and commit.
5. Push your branch and open a pull request targeting `main`.
6. Link the issue using `Closes #12` when appropriate.
7. Ask a teammate to review; merge when the agreed checks pass.
8. Switch back to `main` and pull before starting another task.

Never push directly to `main`, force-push shared branches, or overwrite a teammate's work. If there is a conflict, coordinate with the other author and verify the combined result.

## Reviews

Check that the change solves its task, runs locally where relevant, handles missing or invalid data, and preserves required attributions. Describe simulated data as simulated. Do not claim clinical accuracy or flight readiness without supporting evaluation.

No programming language, framework, install command, or test command is fixed yet. Add reproducible setup and local checks after the team chooses its stack during the event.

## AI and external materials

Keep a record of the tool, purpose, files affected, and human verification for AI-assisted work. Follow the current NASA disclosure and generated-media requirements.

Record external libraries, datasets, assets, licenses, and references as they are used. A source-code license does not automatically cover bundled datasets or model weights.

## Publication

Check public links in a private browser window. Verify that the delivered version matches the description and demo. Do not publish real personal health records or secrets. Complete the official Space Apps project page and press Submit for Judging before the deadline.
