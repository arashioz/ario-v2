import { api } from './api';

export interface WorkshopInput {
  requestId: string;
  inputs: { productId: string; quantity: number }[];
  outputProductId: string;
  outputCategory: string;
  outputQuantity: number;
  packagingCost: number;
  laborCost: number;
  laborPercent?: number;
  laborFlatCost?: number;
  sellPrice: number;
  notes?: string;
}
export interface WorkshopBatch {
  _id: string;
  date: string;
  inputs: { productId: string; productName: string; quantity: number; unit: string; unitCost: number }[];
  output: { productId: string; productName: string; quantity: number; unit: string; unitCost: number; category?: string };
  packagingCost: number;
  laborCost: number;
  laborPercent?: number;
  laborFlatCost?: number;
  totalCost: number;
  sellPrice: number;
  notes: string;
  createdByName: string;
}
export const workshopService = {
  async list(): Promise<WorkshopBatch[]> { return (await api.get('/workshop')).data; },
  async create(input: WorkshopInput): Promise<WorkshopBatch> { return (await api.post('/workshop', input)).data; },
};
