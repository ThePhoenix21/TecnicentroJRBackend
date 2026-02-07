# Supply Order Approval with Email Implementation

## Overview
This implementation adds a new endpoint `POST /api/supply-orders/{orderId}/approve-with-email` that approves a supply order and sends an email notification to the provider with a PDF attachment.

## Files Created/Modified

### 1. PDF Service (`src/common/pdf/pdf.service.ts`)
- **Purpose**: Generates HTML content for supply order PDFs
- **Method**: `generateSupplyOrderPdf(supplyOrder: SupplyOrderData): Promise<string>`
- **Features**:
  - Professional HTML template with CSS styling
  - Complete order information (basic data, provider info, products list)
  - Responsive design with print-friendly styles
  - HTML escaping for security

### 2. Mail Service Extension (`src/mail/mail.service.ts`)
- **Added Methods**:
  - `sendCustomEmail()` - Enhanced to support attachments
  - `sendSupplyOrderApprovalEmail()` - Specialized method for supply order notifications
- **Features**:
  - Professional email template
  - HTML attachment with order details
  - Error handling and logging

### 3. Supply Order Service (`src/supply-order/supply-order.service.ts`)
- **Added Method**: `approveWithEmail(orderId: string, user?: AuthUser)`
- **Process**:
  1. Validates order exists and is in "ISSUED" status
  2. Validates provider has email configured
  3. Updates order status to "PENDING"
  4. Generates PDF HTML content
  5. Sends email with attachment
  6. Returns success response

### 4. Supply Order Controller (`src/supply-order/supply-order.controller.ts`)
- **Added Endpoint**: `POST :id/approve-with-email`
- **Features**:
  - Admin role required
  - Inventory management permissions required
  - Rate limiting (20 requests per minute)
  - Swagger documentation

### 5. Supply Order Module (`src/supply-order/supply-order.module.ts`)
- **Added Dependencies**:
  - `PdfService`
  - `MailModule`

## API Endpoint

### POST /api/supply-orders/{orderId}/approve-with-email

**Headers:**
- `Authorization: Bearer <jwt-token>`

**Response:**
```json
{
  "message": "Orden aprobada y email enviado exitosamente",
  "orderId": "uuid-de-la-orden",
  "providerEmail": "email@proveedor.com",
  "pdfGenerated": true
}
```

**Error Responses:**
- `404`: Orden no encontrada
- `400`: Orden no está en estado ISSUED
- `400`: Proveedor sin email configurado
- `500`: Error generando PDF o enviando email

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Email Configuration
MAIL_SERVICE="gmail" # Options: "gmail" or "resend"

# For Gmail SMTP
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-app-password"
EMAIL_FROM_NAME="Sistema de Gestión"

# For Resend
RESEND_API_KEY="re_your_resend_api_key"
RESEND_FROM="onboarding@yourdomain.com"

# Application
APP_NAME="Sistema de Gestión"
APP_URL="http://localhost:3000"
```

## Email Configuration

### Gmail Setup
1. Enable 2-factor authentication
2. Generate an App Password
3. Use the App Password in `EMAIL_PASS`

### Resend Setup
1. Create a Resend account
2. Generate API key
3. Configure domain settings

## PDF Structure

The generated PDF includes:
- **Header**: "ORDEN DE SUMINISTRO" title
- **Basic Data**: Code, Status, Date, Warehouse/Store, Created by
- **Provider Info**: Name, RUC, Phone, Email, Address
- **Products Table**: Product name, Quantity, Notes
- **Totals**: Total product count
- **Description/Notes**: If available
- **Footer**: Auto-generated notice and timestamp

## Security Features

- HTML content escaping to prevent XSS
- Role-based access control
- Rate limiting
- Input validation
- Error handling with logging

## Testing

To test the implementation:

1. Ensure email configuration is set up
2. Create a supply order with a provider that has an email
3. Call the endpoint with a valid JWT token
4. Verify:
   - Order status changes to "PENDING"
   - Email is sent to provider
   - Email contains HTML attachment
   - Response format matches specification

## Dependencies

The implementation uses existing dependencies:
- `@nestjs/common`
- `@prisma/client`
- `nodemailer` (already installed)
- `handlebars` (already installed)

No additional dependencies required.

## Future Enhancements

- Convert HTML to actual PDF using puppeteer or similar
- Add email queue for high volume
- Implement retry logic for email failures
- Add email templates customization
- Add PDF watermarking
