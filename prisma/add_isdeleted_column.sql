-- Verificar si la columna ya existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'isDeleted') THEN
        -- Agregar la columna con valor por defecto false
        ALTER TABLE "Product" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;
        
        -- Agregar un comentario a la columna (opcional pero recomendado)
        COMMENT ON COLUMN "Product"."isDeleted" IS 'Indica si el producto ha sido eliminado lógicamente';
        
        RAISE NOTICE 'Columna isDeleted agregada exitosamente a la tabla Product';
    ELSE
        RAISE NOTICE 'La columna isDeleted ya existe en la tabla Product';
    END IF;
END $$;
