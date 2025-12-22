
const { TenantFeature } = require('@prisma/client');

console.log('Node Environment Check:');
console.log('Features available:', Object.keys(TenantFeature));
console.log('Has FASTSERVICE:', 'FASTSERVICE' in TenantFeature);
