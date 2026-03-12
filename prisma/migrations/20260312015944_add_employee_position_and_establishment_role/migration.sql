-- AlterTable
ALTER TABLE "Employed" ADD COLUMN     "positionId" TEXT;

-- AlterTable
ALTER TABLE "StoreEmployed" ADD COLUMN     "establishmentRoleId" TEXT;

-- AlterTable
ALTER TABLE "WarehouseEmployed" ADD COLUMN     "establishmentRoleId" TEXT;

-- CreateTable
CREATE TABLE "EmployeePosition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstablishmentRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EstablishmentRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePosition_tenantId_name_key" ON "EmployeePosition"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentRole_tenantId_name_key" ON "EstablishmentRole"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "StoreEmployed" ADD CONSTRAINT "StoreEmployed_establishmentRoleId_fkey" FOREIGN KEY ("establishmentRoleId") REFERENCES "EstablishmentRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseEmployed" ADD CONSTRAINT "WarehouseEmployed_establishmentRoleId_fkey" FOREIGN KEY ("establishmentRoleId") REFERENCES "EstablishmentRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePosition" ADD CONSTRAINT "EmployeePosition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentRole" ADD CONSTRAINT "EstablishmentRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentRole" ADD CONSTRAINT "EstablishmentRole_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employed" ADD CONSTRAINT "Employed_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "EmployeePosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
