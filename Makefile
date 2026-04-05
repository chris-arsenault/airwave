.PHONY: ci lint typecheck

ci: lint typecheck

lint:
	cd backend && cargo clippy -- -D warnings
	cd backend && cargo fmt -- --check
	cd frontend && pnpm exec eslint .

typecheck:
	cd frontend && pnpm exec tsc --noEmit
