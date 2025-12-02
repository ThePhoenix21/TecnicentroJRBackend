export class ReceiptInfoDto {
  businessName: string;
  address: string;
  phone: string;
  currentDate: string;
  currentTime: string;
  orderNumber: string;
  sellerName: string;
  clientName: string;
  clientDni: string;
  clientPhone: string;
  paidAmount: number;
  order: any;
}

export class ServiceReceiptResponseDto {
  receipt: ReceiptInfoDto;
  services: any[];
  payments: any[];
}

export class ProductReceiptResponseDto {
  receipt: ReceiptInfoDto;
  products: any[];
  payments: any[];
}

export class AdvanceReceiptResponseDto {
  receipt: ReceiptInfoDto;
  service: any;
  payments: any[];
}

export class CompletionReceiptResponseDto {
  receipt: ReceiptInfoDto;
  service: any;
  payments: any[];
}

export class CashCloseReceiptResponseDto {
  receipt: ReceiptInfoDto;
  cashSession: any;
  movements: any[];
}
