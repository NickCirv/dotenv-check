# dotenv-check — command reference

[Overview](../README.md) · [Research record](RESEARCH.md)

Describes revision `5244998863f2a123a2631d47e1ef864bd9af6079`. Commands are source-inspected; no execution results are asserted.

## Workflow

Compares keys with an example or --required list, supports optional-key annotations, and reports presence without printing values. --check-format enables value-shape checks; --strict makes warning statuses fail.

Use sanitized fixtures when sharing reports. A missing input file is an error; a missing example leaves only explicit requirements and local checks.

```bash
node index.js --env ../your-project/.env --example ../your-project/.env.example --check-duplicates --format json
```

## Commands and controls

| Control | Behavior in the inspected implementation |
| --- | --- |
| `--env PATH` | Choose the environment file |
| `--example PATH` | Choose the reference example |
| `--required LIST` | Supply explicit required keys |
| `--check-duplicates` | Report duplicate declarations |
| `--strict` | Fail warning statuses as well as errors |

## Interpretation and side effects

This parser is not a full shell or dotenv evaluator. Format findings are reported but the inspected final exit calculation uses missing/parse errors and warning statuses; do not assume every format finding fails CI. Extra means absent from the example, not unused by source code.

## Implementation reference

- [package.json](https://github.com/NickCirv/dotenv-check/blob/5244998863f2a123a2631d47e1ef864bd9af6079/package.json)
- [index.js](https://github.com/NickCirv/dotenv-check/blob/5244998863f2a123a2631d47e1ef864bd9af6079/index.js)
- [test/smoke.test.js](https://github.com/NickCirv/dotenv-check/blob/5244998863f2a123a2631d47e1ef864bd9af6079/test/smoke.test.js)
