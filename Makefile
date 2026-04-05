.PHONY: ci lint lint-fix format format-check typecheck test build

ci: lint format-check typecheck test

# ── Lint ─────────────────────────────────────────────────────

lint:
	cd frontend && pnpm exec eslint .
	cd backend && cargo clippy -- -D warnings

lint-fix:
	cd frontend && pnpm exec eslint . --fix
	cd backend && cargo clippy --fix --allow-dirty

# ── Format ───────────────────────────────────────────────────

format:
	cd frontend && pnpm exec prettier --write .
	cd backend && cargo fmt

format-check:
	cd frontend && pnpm exec prettier --check .
	cd backend && cargo fmt -- --check

# ── Typecheck ────────────────────────────────────────────────

typecheck:
	cd frontend && pnpm exec tsc --noEmit

# ── Test ─────────────────────────────────────────────────────

test:
	cd frontend && pnpm exec vitest run
	cd backend && cargo test

# ── Build ────────────────────────────────────────────────────

build:
	cd frontend && pnpm run build
	cd backend && cargo build --release
