# Changelog

## 1.0.0 (2026-01-07)


### Features

* Add Docker support with multi-stage build, deployment configuration, and CI workflows. Introduced .dockerignore, Dockerfile, flowcore.deployment.json, and GitHub Actions for build, test, and release processes. ([2bc0620](https://github.com/flowcore-io/bun-webhook-service/commit/2bc0620b43b34033bdc2a073110019572ff30b00))
* Add test environment configuration and enhance service integration. Introduced .env.test and docker-compose.dev.yml for local development. Updated package.json for new dependencies and modified drizzle.config.ts for schema management. Enhanced API with Redis and NATS service integration, and added ingestion handling with Flowcore pathways. ([fdd1a92](https://github.com/flowcore-io/bun-webhook-service/commit/fdd1a92605445710ff0cdd3bbd0011b824961fdd))
* Initialize bun-webhook-service project with essential configuration files and structure. Added .gitignore, package.json, README.md, and TypeScript configuration. Implemented core API structure with health and ingestion endpoints, integrated with Flowcore SDK. Set up database connection using Drizzle ORM and PostgreSQL. Included testing framework setup with Docker support for local development. ([81d78ba](https://github.com/flowcore-io/bun-webhook-service/commit/81d78ba70d1348dff3fa42f242d0e7f8832a0e86))


### Bug Fixes

* Add CI environment variable to GitHub Actions workflow. Introduced the CI variable in the test.yml file to ensure proper configuration during continuous integration runs. ([7a95fe6](https://github.com/flowcore-io/bun-webhook-service/commit/7a95fe6aa882fc6b1b0fa4f4d8b73f3cd4294e97))
* Clean up data-core handler functions for improved readability. Standardized formatting and error handling in Redis cache invalidation logic. Updated type annotations for better clarity. ([41c9190](https://github.com/flowcore-io/bun-webhook-service/commit/41c9190e7d67aace71b8e948d548e365dfd4f702))
* Enhance logging for Docker Compose service management in services.fixture.ts. Updated service startup and shutdown functions to output logs for both stdout and stderr, improving visibility into the service management process. ([062077b](https://github.com/flowcore-io/bun-webhook-service/commit/062077bdf0b757a209769f55797241dc99486a74))
* Refactor Docker Compose service startup process. Updated services.fixture.ts to first stop existing containers without volume removal, added a delay for cleanup, and enforced service recreation to resolve dependency issues. ([6556db6](https://github.com/flowcore-io/bun-webhook-service/commit/6556db6a21383c1c4e84e659c3fb9d1be827ec0b))
* Refactor setup lifecycle in test/setup.ts. Improved readability by adjusting formatting and added a timeout for the beforeAll setup function to accommodate longer service startup times in CI environments. ([9f953a9](https://github.com/flowcore-io/bun-webhook-service/commit/9f953a9ccff84326a7c20095effc60a134b8ddec))
* Remove redundant service startup step in CI workflow. Eliminated the "Start Services" step from the GitHub Actions test workflow to streamline the testing process. ([d97b2c6](https://github.com/flowcore-io/bun-webhook-service/commit/d97b2c62a1fcac63ffe41da7c2c7a43da3184ec7))
* Simplify Docker Compose service startup in services.fixture.ts. Removed container cleanup steps for local development, allowing users to manage services manually while maintaining a clean environment in CI. ([1042e35](https://github.com/flowcore-io/bun-webhook-service/commit/1042e35f796cad144ed10d5581d6b8d78a1eafe4))
* Update biome schema version and refactor ingestion handlers. Changed schema version in biome.json and modified ingestion handlers to use FlowcoreEvent type for better type safety. Enhanced event handling by consolidating registration and handling logic in pathways.ts, improving code readability and maintainability. ([03efa57](https://github.com/flowcore-io/bun-webhook-service/commit/03efa57e769b8265c6fd0771d1d15c529ea548ef))
* Update Docker Compose configuration to avoid port conflicts. Changed Redis, NATS, and Redis Sentinel ports in docker-compose.yml and updated corresponding environment variables in ingestion.setup.ts and ingestion.test.ts. Added cleanup step in services.fixture.ts to stop existing containers before starting new ones. ([d4b921c](https://github.com/flowcore-io/bun-webhook-service/commit/d4b921c7b712b1898b8e821a2dfb4f84cfa2106d))
* Update Redis Sentinel port in Docker Compose and corresponding environment variables. Changed port mapping in docker-compose.yml and updated REDIS_SENTINEL_HOSTS in ingestion.setup.ts and ingestion.test.ts to reflect the new configuration. ([76ceb98](https://github.com/flowcore-io/bun-webhook-service/commit/76ceb98a85174b3a93a0c14fa4df60327506cc2c))
