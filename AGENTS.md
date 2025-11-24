# Repository Guidelines

This repository contains Synapse, the Matrix homeserver. Use this guide for day‑to‑day development, testing, and contributions.

## Project Structure & Module Organization
- Core server code: `synapse/` (Python package)
- Tests: `tests/` (Twisted Trial test suite)
- Rust extension: `rust/` (built via `maturin`; loaded as `synapse.synapse_rust`)
- Docs and guides: `docs/`
- Dev scripts: `scripts-dev/`
- Build/config: `pyproject.toml`, `poetry.lock`, `tox.ini`

## Build, Test, and Development Commands
- Install (dev + extras): `poetry install --with dev -E all`
- Lint: `poetry run ruff check .`  • Format: `poetry run ruff format .`
- Type check: `poetry run mypy`
- Run tests (tox): `poetry run tox -e py311`  • Quick run: `poetry run trial tests`
- Benchmarks (optional): `poetry run tox -e benchmark`
- Build packages: `poetry build`

## Coding Style & Naming Conventions
- Python 3.10+; 4‑space indent; line length 88; double quotes.
- Use type hints and Google‑style docstrings. Keep functions small and focused.
- Naming: `CamelCase` for classes/types; `snake_case` for functions/variables.
- Imports sorted via ruff‑isort (Twisted has its own section). Prefer importing symbols over modules.

## Testing Guidelines
- Framework: Twisted Trial. Name tests `tests/test_*.py`.
- Fast local run: `poetry run trial tests/path/to/test_file.py`.
- CI‑like runs and coverage via tox: `poetry run tox`.
- Postgres tests: set `SYNAPSE_POSTGRES=1` (tox factor supported).

## Commit & Pull Request Guidelines
- Commits: short, imperative subject; reference issues/PRs when relevant (e.g., `Fix login rate limiting (#1234)`).
- PRs: include clear description, linked issues, tests for changes, and docs when behavior/config changes.
- Changelog: add a Towncrier fragment under `changelog.d/` (`feature`, `bugfix`, `doc`, `removal`, `misc`).

## Security & Configuration Tips
- Do not commit secrets. Use sample configs: `docs/sample_config.yaml`, `docs/sample_log_config.yaml`.
- Local runs use the `synapse_homeserver` entrypoint; generate config with `generate_config` (see docs).

