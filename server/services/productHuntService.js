const fetch = require('node-fetch');
const dbService = require('./dbService');

/**
 * Fetch upvote information for a Product Hunt URL and optionally update database.
 * @param {string} productId - ID of product in database
 * @param {string} url - Product Hunt URL of the product
 * @returns {Promise<{votesCount:number, phId:string, name:string}>}
 */
async function fetchUpvotes(productId, url) {
  if (!url) {
    throw new Error('Product Hunt URL is required');
  }

  let slug;
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const productIndex = pathParts.indexOf('products');
    if (productIndex !== -1 && pathParts[productIndex + 1]) {
      slug = pathParts[productIndex + 1];
    } else {
      throw new Error('Invalid Product Hunt URL format');
    }
  } catch (err) {
    throw new Error(`Invalid Product Hunt URL: ${err.message}`);
  }

  const token = process.env.PRODUCT_HUNT_API_TOKEN;
  if (!token) {
    const err = new Error('Product Hunt API token not configured');
    err.status = 500;
    throw err;
  }

  const query = `
    query {
      post(slug: "${slug}") {
        id
        name
        votesCount
      }
    }
  `;

  const response = await fetch('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ query })
  });

  if (response.status === 401 || response.status === 403) {
    const err = new Error('Invalid Product Hunt API token');
    err.status = 401;
    throw err;
  }

  if (response.status === 429) {
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    throw err;
  }

  const data = await response.json();
  if (!response.ok || data.errors) {
    throw new Error(data.errors ? data.errors[0].message : 'GraphQL request failed');
  }

  const { post } = data.data;
  if (!post) {
    throw new Error(`No post found for slug: ${slug}`);
  }

  const { votesCount, id: phId, name } = post;

  if (productId) {
    try {
      await dbService.updateProductFields(productId, { upvotes: votesCount, phId, name });
    } catch (err) {
      // log but do not fail
      console.error(`Failed to update product ${productId} with upvotes`, err.message);
    }
  }

  return { votesCount, phId, name };
}

module.exports = { fetchUpvotes };
