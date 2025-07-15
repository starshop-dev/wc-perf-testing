/* eslint-disable import/no-unresolved */
/**
 * External dependencies
 */
import { sleep, check, group } from 'k6';
import http from 'k6/http';
import { randomIntBetween, findBetween } from 'https://jslib.k6.io/k6-utils/1.1.0/index.js';

/**
 * Internal dependencies
 */
import {
	base_url,
	product_url,
	product_search_term,
	think_time_min,
	think_time_max,
	FOOTER_TEXT,
	STORE_NAME,
	addresses_guest_billing_first_name,
	addresses_guest_billing_last_name,
	addresses_guest_billing_company,
	addresses_guest_billing_country,
	addresses_guest_billing_address_1,
	addresses_guest_billing_address_2,
	addresses_guest_billing_city,
	addresses_guest_billing_state,
	addresses_guest_billing_postcode,
	addresses_guest_billing_phone,
	addresses_guest_billing_email,
	payment_method,
} from '../config.js';
import {
	htmlRequestHeader,
	jsonRequestHeader,
	allRequestHeader,
	commonRequestHeaders,
	commonGetRequestHeaders,
	commonPostRequestHeaders,
	commonNonStandardHeaders,
} from '../headers.js';

// Get product ID from environment variable or extracted from page
const product_id = __ENV.P_ID || null;

export const options = {
	scenarios: {
		// 80% of traffic - browsing flow (no purchases)
		browsing: {
			executor: 'ramping-arrival-rate',
			startRate: 8, // starting iterations per minute (80% of total)
			timeUnit: '1m',
			preAllocatedVUs: 10,
			maxVUs: 50,
			stages: [
				{ target: 8, duration: '2m' },    // ramp up to 8 iterations/min
				{ target: 40, duration: '10m' },  // ramp up to 40 iterations/min
				{ target: 40, duration: '5m' },   // sustain 40 iterations/min
				{ target: 8, duration: '2m' },    // ramp down to 8 iterations/min
			],
			exec: 'browsingFlow',
			tags: { scenario: 'browsing', flow_type: 'non_conversion' },
		},
		// 20% of traffic - conversion flow (complete purchase)
		conversion: {
			executor: 'ramping-arrival-rate',
			startRate: 2, // starting iterations per minute (20% of total)
			timeUnit: '1m',
			preAllocatedVUs: 5,
			maxVUs: 15,
			stages: [
				{ target: 2, duration: '2m' },    // ramp up to 2 iterations/min
				{ target: 10, duration: '10m' },  // ramp up to 10 iterations/min
				{ target: 10, duration: '5m' },   // sustain 10 iterations/min
				{ target: 2, duration: '2m' },    // ramp down to 2 iterations/min
			],
			exec: 'conversionFlow',
			tags: { scenario: 'conversion', flow_type: 'purchase' },
		},
	},
	thresholds: {
		// Performance thresholds for different request types
		'http_req_duration{name:Shopper - Site Root}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - Shop Page}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - Product Page}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - Search Products}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - wc-ajax=add_to_cart}': ['p(95)<3000'],
		'http_req_duration{name:Shopper - View Cart}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - View Checkout}': ['p(95)<5000'],
		'http_req_duration{name:Shopper - Store API Checkout}': ['p(95)<10000'],
		'http_req_failed': ['rate<0.1'], // Less than 10% of requests should fail
	},
};

function homePage() {
	group('Home Page', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(`${base_url}/`, {
			headers: requestHeaders,
			tags: { name: 'Shopper - Site Root' },
		});

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'is HTML page': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'),
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

function shopPage() {
	group('Shop Page', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(`${base_url}/shop`, {
			headers: requestHeaders,
			tags: { name: 'Shopper - Shop Page' },
		});

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'is HTML page': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'),
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

function singleProduct() {
	let productId = product_id; // Use environment variable if provided

	group('Product Page', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(`${base_url}/product/${product_url}`, {
			headers: requestHeaders,
			tags: { name: 'Shopper - Product Page' },
		});

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'is HTML page': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'),
		});

		// If product ID not provided via environment variable, try to extract from page
		if (!productId) {
			console.log('No P_ID environment variable provided, attempting to extract product ID from product page...');

			// Method 1: Look for add-to-cart button with value
			const addToCartButtonMatch = response.body.match(/name="add-to-cart"[^>]*value="(\d+)"/);
			if (addToCartButtonMatch) {
				productId = addToCartButtonMatch[1];
				console.log(`Found product ID via add-to-cart button: ${productId}`);
			} else {
				// Method 2: Look for data-product_id attribute
				const dataProductIdMatch = response.body.match(/data-product_id="(\d+)"/);
				if (dataProductIdMatch) {
					productId = dataProductIdMatch[1];
					console.log(`Found product ID via data-product_id: ${productId}`);
				} else {
					// Method 3: Look for product_id in any form or input
					const productIdMatch = response.body.match(/product_id["\s]*(?:value)?["\s]*[=:]["\s]*(\d+)/);
					if (productIdMatch) {
						productId = productIdMatch[1];
						console.log(`Found product ID via product_id pattern: ${productId}`);
					} else {
						// Method 4: Look for postid in body class
						const postIdMatch = response.body.match(/postid-(\d+)/);
						if (postIdMatch) {
							productId = postIdMatch[1];
							console.log(`Found product ID via postid class: ${productId}`);
						} else {
							console.log('Product ID not found in any known pattern');
							console.log('Page contains add-to-cart:', response.body.includes('add-to-cart'));
							console.log('Page contains product_id:', response.body.includes('product_id'));
						}
					}
				}
			}
		} else {
			console.log(`Using product ID from P_ID environment variable: ${productId}`);
		}
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));

	return productId;
}

function searchProduct() {
	group('Search Product', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(
			`${base_url}/?s=${product_search_term}&post_type=product`,
			{
				headers: requestHeaders,
				tags: { name: 'Shopper - Search Products' },
			}
		);

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'is HTML page': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'),
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

function addToCart(productId) {
	group('Add to Cart', function () {
		const requestHeaders = Object.assign(
			{},
			jsonRequestHeader,
			commonRequestHeaders,
			commonPostRequestHeaders,
			commonNonStandardHeaders
		);

		if (!productId) {
			throw new Error('Product ID not found! Cannot proceed with add to cart test. Please check if the product exists and the HTML structure is correct.');
		}

		console.log(`Adding product ID ${productId} to cart`);

		const response = http.post(
			`${base_url}/?wc-ajax=add_to_cart`,
			{
				product_id: productId,
				quantity: '1',
			},
			{
				headers: requestHeaders,
				tags: { name: 'Shopper - wc-ajax=add_to_cart' },
			}
		);

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'product added to cart': (r) => !r.body.includes('error') && !r.body.includes('failed'),
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

function viewCart() {
	group('View Cart', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(`${base_url}/cart`, {
			headers: requestHeaders,
			tags: { name: 'Shopper - View Cart' },
		});

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'cart is not empty': (r) => !r.body.includes('Your cart is currently empty.'),
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

function checkout() {
	let storeApiNonce;

	group('Proceed to Checkout', function () {
		const requestHeaders = Object.assign(
			{},
			htmlRequestHeader,
			commonRequestHeaders,
			commonGetRequestHeaders,
			commonNonStandardHeaders
		);

		const response = http.get(`${base_url}/checkout`, {
			headers: requestHeaders,
			tags: { name: 'Shopper - View Checkout' },
		});

		check(response, {
			'is status 200': (r) => r.status === 200,
			'response has content': (r) => r.body.length > 0,
			'is checkout page': (r) => r.body.includes('checkout'),
		});

		// Extract Store API nonce from checkout page
		// Look for storeApiNonce in the page JavaScript
		const storeApiNonceMatch = response.body.match(/storeApiNonce["\s]*:["\s]*["']([^"']+)["']/);
		if (storeApiNonceMatch) {
			storeApiNonce = storeApiNonceMatch[1];
			console.log(`Extracted Store API nonce: ${storeApiNonce}`);
		} else {
			// Alternative pattern: wp.apiFetch.nonceMiddleware
			const apiFetchNonceMatch = response.body.match(/wp\.apiFetch\.nonceMiddleware[^"']*["']([^"']+)["']/);
			if (apiFetchNonceMatch) {
				storeApiNonce = apiFetchNonceMatch[1];
				console.log(`Extracted Store API nonce via apiFetch: ${storeApiNonce}`);
			} else {
				console.log('Store API nonce not found in checkout page');
			}
		}
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));

	group('Place Order', function () {
		if (!storeApiNonce) {
			throw new Error('Store API nonce not found! Cannot proceed with checkout. Please check if the checkout page contains the required nonce.');
		}

		const requestHeaders = Object.assign(
			{},
			jsonRequestHeader,
			commonRequestHeaders,
			commonPostRequestHeaders,
			commonNonStandardHeaders,
			{
				'Content-Type': 'application/json',
				'Nonce': storeApiNonce, // Dynamically extracted Store API nonce
			}
		);

		const requestPayload = {
			billing_address: {
				first_name: `${addresses_guest_billing_first_name}`,
				last_name: `${addresses_guest_billing_last_name}`,
				company: `${addresses_guest_billing_company}`,
				country: `${addresses_guest_billing_country}`,
				address_1: `${addresses_guest_billing_address_1}`,
				address_2: `${addresses_guest_billing_address_2}`,
				city: `${addresses_guest_billing_city}`,
				state: `${addresses_guest_billing_state}`,
				postcode: `${addresses_guest_billing_postcode}`,
				phone: `${addresses_guest_billing_phone}`,
				email: `${addresses_guest_billing_email}`,
			},
			payment_method: `${payment_method}`,
		};

		const response = http.post(
			`${base_url}/index.php?rest_route=/wc/store/v1/checkout`,
			JSON.stringify(requestPayload),
			{
				headers: requestHeaders,
				tags: { name: 'Shopper - Store API Checkout' },
			}
		);

		console.log('Order placed successfully. Response status:', response.status);

		check(response, {
			'place order is status 200': (r) => r.status === 200,
			'order placed successfully': (r) => {
				try {
					const body = JSON.parse(r.body);
					return body.order_id && body.order_id > 0;
				} catch (e) {
					return false;
				}
			},
		});
	});

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));

	// Note: Order received page will be accessed after successful order placement
	// For now, we'll skip this step since we first need to get the order ID from the successful checkout

	sleep(randomIntBetween(`${think_time_min}`, `${think_time_max}`));
}

// Browsing flow - 80% of traffic (no purchases)
export function browsingFlow() {
	homePage();
	shopPage();
	const productId = singleProduct();
	searchProduct();

	// Some users might add to cart but don't complete purchase
	if (Math.random() < 0.3) { // 30% of browsers add to cart but don't complete
		if (productId) {
			addToCart(productId);
			// 50% of those who add to cart will view cart
			if (Math.random() < 0.5) {
				viewCart();
			}
		}
	}
}

// Conversion flow - 20% of traffic (complete purchase)
export function conversionFlow() {
	homePage();
	shopPage();
	const productId = singleProduct();
	searchProduct();

	if (productId) {
		addToCart(productId);
		viewCart();
		checkout();
	} else {
		console.warn('Product ID not found, skipping checkout flow');
	}
}

// Keep the original function for backward compatibility
export default function () {
	// This is now deprecated in favor of the scenario-based approach
	// But keeping it for any direct script execution
	conversionFlow();
}