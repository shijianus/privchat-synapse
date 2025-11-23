# Repository Guidelines

This repository contains Synapse, the Matrix homeserver. Use this guide for day‑to‑day development, testing, and contributions.

## Project Structure & Module Organization
- Core server: `synapse/` (Python package)
- Tests: `tests/` (Twisted Trial test suite)
- Rust extension: `rust/` (built via maturin; loaded as `synapse.synapse_rust`)
- Docs and guides: `docs/`
- Dev tooling and scripts: `scripts-dev/`
- Packaging/build config: `pyproject.toml`, `poetry.lock`, `tox.ini`

## Build, Test, and Development Commands
- Install (dev + extras): `poetry install --with dev -E all`
- Lint (ruff): `poetry run ruff check .` and format: `poetry run ruff format .`
- Type check (mypy): `poetry run mypy`
- Run tests (tox + Trial): `poetry run tox -e py311` or `poetry run trial tests`
- Benchmark (optional): `poetry run tox -e benchmark`
- Build sdists/wheels: `poetry build`

## Coding Style & Naming Conventions
- Python 3.10+; line length 88; double quotes; 4‑space indent.
- Use type hints; keep functions small and well‑documented (Google‑style docstrings).
- Naming: `CamelCase` for classes/types; `snake_case` for functions/variables.
- Imports sorted by ruff‑isort sections (notably a dedicated `twisted` section). Prefer importing symbols over modules.

## Testing Guidelines
- Framework: Twisted Trial. Place tests under `tests/` using `test_*.py` naming.
- Fast local run: `poetry run trial tests/path/to/test_file.py`.
- Tox drives CI‑like runs and coverage; prefer `poetry run tox` before opening a PR.
- For Postgres‑backed tests, set `SYNAPSE_POSTGRES=1` (supported tox factor).

## Commit & Pull Request Guidelines
- Commits: short, imperative subject; include issue/PR reference when applicable (e.g., `Fix login rate limiting (#1234)`).
- PRs: include a clear description, linked issues, test coverage for changes, and documentation updates when behavior/config changes.
- Changelog: add a Towncrier fragment under `changelog.d/` (types: `feature`, `bugfix`, `doc`, `removal`, `misc`).

## Security & Configuration Tips
- Never commit secrets or real keys; use sample configs in `docs/sample_config.yaml` and `docs/sample_log_config.yaml`.
- Local runs use the `synapse_homeserver` entrypoint (see docs) and generated config via `generate_config`.

