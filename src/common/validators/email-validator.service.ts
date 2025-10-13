import { Injectable } from '@nestjs/common';
import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

@Injectable()
export class EmailValidatorService {
  async isEmailValid(email: string): Promise<boolean> {
    const domain = email.split('@')[1];
    try {
      const addresses = await resolveMx(domain);
      return addresses && addresses.length > 0;
    } catch (error) {
      return false;
    }
  }
}
