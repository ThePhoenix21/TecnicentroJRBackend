export const PERMISSIONS = {
    // permisos de dashboard
    VIEW_DASHBOARD: 'VIEW_DASHBOARD',

    // permisos de inventario
    VIEW_INVENTORY: 'VIEW_INVENTORY',
    MANAGE_INVENTORY: 'MANAGE_INVENTORY',

    // permisos de productos
    VIEW_PRODUCTS: 'VIEW_PRODUCTS',
    MANAGE_PRODUCTS: 'MANAGE_PRODUCTS',
    MANAGE_PRICES: 'MANAGE_PRICES',
    VIEW_CLIENTS: 'VIEW_CLIENTS',
    MANAGE_CLIENTS: 'MANAGE_CLIENTS',

    // permisos de servicios
    VIEW_SERVICES: 'VIEW_SERVICES',
    MANAGE_SERVICES: 'MANAGE_SERVICES',

    // permisos de ventas / ordenes
    VIEW_ORDERS: 'VIEW_ORDERS',
    MANAGE_ORDERS: 'MANAGE_ORDERS',

    // permisos de caja
    VIEW_CASH: 'VIEW_CASH',
    MANAGE_CASH: 'MANAGE_CASH',

} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);
