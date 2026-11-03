# Keep this tag equal to the @playwright/test version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /e2e
COPY tests/e2e/package.json tests/e2e/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tests/e2e/ ./
CMD ["npx", "playwright", "test"]
