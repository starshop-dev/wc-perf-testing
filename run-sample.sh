URL="{}" \
P_TERM="{}" \
P_SKU="{}" \
P_URL="{}" \
P_ID="{}" \
HOST="{}" \
ENVIRONMENT="production" \
K6_ELASTICSEARCH_URL="http://localhost:9200" \
K6_WEB_DASHBOARD=true \
k6 run --out output-elasticsearch tests/basic-non-auth-test.js