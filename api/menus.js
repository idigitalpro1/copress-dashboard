'use strict';

const menuData = require('../data/menus.json');

const PUBLIC_HEADERS = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
};

function townFromRequest(request) {
  const queryValue = request.query && request.query.town;
  const firstValue = Array.isArray(queryValue) ? queryValue[0] : queryValue;

  if (firstValue) return String(firstValue).trim().toLowerCase();

  try {
    const url = new URL(request.url || '/api/menus', 'https://menu.local');
    return (url.searchParams.get('town') || '').trim().toLowerCase();
  } catch (_error) {
    return '';
  }
}

function writeResponse(response, statusCode, body, method) {
  Object.entries(PUBLIC_HEADERS).forEach(([name, value]) => response.setHeader(name, value));
  response.statusCode = statusCode;
  response.end(method === 'HEAD' ? '' : JSON.stringify(body, null, 2));
}

module.exports = function menusHandler(request, response) {
  const method = String(request.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    Object.entries(PUBLIC_HEADERS).forEach(([name, value]) => response.setHeader(name, value));
    response.statusCode = 204;
    response.end('');
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD, OPTIONS');
    writeResponse(response, 405, {
      error: 'method_not_allowed',
      message: 'Use GET or HEAD for the public menu feed.'
    }, method);
    return;
  }

  const requestedTown = townFromRequest(request);
  const towns = requestedTown
    ? menuData.towns.filter((town) => town.id === requestedTown)
    : menuData.towns;

  if (requestedTown && towns.length === 0) {
    writeResponse(response, 404, {
      error: 'town_not_found',
      message: `No menu is published for "${requestedTown}".`,
      availableTowns: menuData.towns.map((town) => town.id)
    }, method);
    return;
  }

  writeResponse(response, 200, {
    meta: {
      schemaVersion: menuData.schemaVersion,
      updatedAt: menuData.updatedAt,
      source: menuData.source,
      requestedTown: requestedTown || null,
      townCount: towns.length,
      venueCount: towns.reduce((total, town) => total + town.venues.length, 0),
      itemCount: towns.reduce(
        (total, town) => total + town.venues.reduce((sum, venue) => sum + venue.items.length, 0),
        0
      )
    },
    towns
  }, method);
};

module.exports.menuData = menuData;
module.exports.townFromRequest = townFromRequest;
