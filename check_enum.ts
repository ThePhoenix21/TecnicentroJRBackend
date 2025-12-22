
import { TenantFeature } from '@prisma/client';

console.log('Valores de TenantFeature en tiempo de ejecución:');
console.log(JSON.stringify(TenantFeature, null, 2));
console.log('¿Existe FASTSERVICE?', 'FASTSERVICE' in TenantFeature);
