# Repository Guidelines

Synapse is Matrix’s flagship homeserver. Contribute effectively by following the structure, tooling, and review expectations below.

## Project Structure & Module Organization
- Core runtime: `synapse/` (Python package) holds homeserver logic, API handlers, and storage layers.
- Integration tests: `tests/` (Twisted Trial) mirrors the package layout; new modules should ship matching tests.
- Native helpers: `rust/` builds the optional `synapse.synapse_rust` extension via `maturin`.
- Documentation and operational guides: `docs/`, with sample configs under `docs/sample_*.yaml`.
- Tooling/support: `scripts/` for deployment helpers and `scripts-dev/` for local maintenance scripts; keep CI definitions in `.ci/` and `.github/`.

## Build, Test, and Development Commands
- `poetry install --with dev -E all` — installs runtime, dev tools, and optional extras used in CI.
- `poetry run ruff check .` / `poetry run ruff format .` — static lint + formatter combo; run before committing.
- `poetry run mypy` — enforces typing discipline; fix new warnings before review.
- `poetry run tox -e py311` — canonical test matrix; uses SQLite unless `SYNAPSE_POSTGRES=1` is exported.
- `poetry run trial tests/path/to/test_file.py` — focused Twisted Trial run for fast iteration.
- `poetry build` — produces distributable wheels/sdists; only needed when cutting releases.

## Coding Style & Naming Conventions
- Python 3.10+, 4 spaces, max line length 88, double quotes preferred.
- Apply Google-style docstrings and exhaustive type hints for public functions.
- Use `CamelCase` for classes/enums, `snake_case` for everything else; module globals stay uppercase.
- Sort imports with ruff-isort; group Twisted imports in their own section.

## Testing Guidelines
- Name files `tests/test_*.py`; mirror module names to ease discovery.
- Use Trial’s `TestCase` subclasses; prefer fakes from `tests/unittest/` instead of real network calls.
- Include regression tests for every bugfix; add Postgres coverage via `tox -e py311-postgres` when touching DB schemas.

## Commit & Pull Request Guidelines
- Commits: imperative, <72 chars, reference issues like `Fix login rate limiting (#1234)`.
- PRs must describe behavior changes, list test coverage, and link related issues.
- When behavior or APIs change, add a Towncrier fragment under `changelog.d/` (e.g., `1234.feature`).
- Screenshots/log excerpts are encouraged for dashboard or monitoring updates.

## Security & Configuration Tips
- Never commit secrets; rely on the sample configs in `docs/` and environment variables.
- Generate local configs via `synapse_homeserver --generate-config --config-path homeserver.yaml`.
- Audit dependencies before enabling optional extras; keep `pyproject.toml` in sync with `poetry.lock`.
