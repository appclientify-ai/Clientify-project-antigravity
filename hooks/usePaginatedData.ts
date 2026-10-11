import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '../services/api.ts';
import { InvoiceRecord } from '../types.ts';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function usePaginatedCategory<T>(category: string, page = 1, limit = 25, search = '') {
  return useQuery<PaginatedResult<T>>({
    queryKey: ['category_items', category, page, limit, search],
    queryFn: () => api.getPaginatedCategory<T>(category, page, limit, search),
    placeholderData: keepPreviousData,
    staleTime: 0, // 3 minutes cache
  });
}

export function usePaginatedInvoices(page = 1, limit = 25, search = '') {
  return usePaginatedCategory<any>('invoice', page, limit, search);
}

export function usePaginatedClients(page = 1, limit = 25, search = '') {
  return usePaginatedCategory<any>('client', page, limit, search);
}

// Optimistic mutation hook for updating Invoice status and details
export function useUpdateInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updatedInvoice: InvoiceRecord) => api.saveInvoice(updatedInvoice),
    onMutate: async (updatedInvoice: InvoiceRecord) => {
      const targetId = updatedInvoice.id || (updatedInvoice as any)._id;
      const isMatch = (inv: any) => inv && (inv.id === targetId || inv._id === targetId);

      await queryClient.cancelQueries({ queryKey: ['category_items', 'invoice'] });
      await queryClient.cancelQueries({ queryKey: ['invoices'] });

      const prevCategoryQueries = queryClient.getQueriesData({ queryKey: ['category_items', 'invoice'] });
      const prevInvoicesQueries = queryClient.getQueriesData({ queryKey: ['invoices'] });

      queryClient.setQueriesData<PaginatedResult<InvoiceRecord>>({ queryKey: ['category_items', 'invoice'] }, (old) => {
        if (!old || !old.items) return old;
        return {
          ...old,
          items: old.items.map((inv) => (isMatch(inv) ? { ...inv, ...updatedInvoice } : inv)),
        };
      });

      queryClient.setQueriesData<InvoiceRecord[]>({ queryKey: ['invoices'] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((inv) => (isMatch(inv) ? { ...inv, ...updatedInvoice } : inv));
      });

      return { prevCategoryQueries, prevInvoicesQueries };
    },
    onError: (_err, _updatedInvoice, context) => {
      if (context?.prevCategoryQueries) {
        context.prevCategoryQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
      if (context?.prevInvoicesQueries) {
        context.prevInvoicesQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
    },
    onSettled: () => {
      api.invalidateCache();
      queryClient.invalidateQueries({ queryKey: ['category_items', 'invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

// Optimistic mutation hook for deleting an invoice
export function useDeleteInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteInvoice(id),
    onMutate: async (deletedId: string) => {
      await queryClient.cancelQueries({ queryKey: ['category_items', 'invoice'] });
      await queryClient.cancelQueries({ queryKey: ['invoices'] });

      const previousQueries = queryClient.getQueriesData({ queryKey: ['category_items', 'invoice'] });
      const prevInvoicesQueries = queryClient.getQueriesData({ queryKey: ['invoices'] });

      queryClient.setQueriesData<PaginatedResult<InvoiceRecord>>({ queryKey: ['category_items', 'invoice'] }, (old) => {
        if (!old || !old.items) return old;
        return {
          ...old,
          items: old.items.filter((inv) => inv.id !== deletedId && (inv as any)._id !== deletedId),
          total: Math.max(0, old.total - 1),
        };
      });

      queryClient.setQueriesData<InvoiceRecord[]>({ queryKey: ['invoices'] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.filter((inv) => inv.id !== deletedId && (inv as any)._id !== deletedId);
      });

      return { previousQueries, prevInvoicesQueries };
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
      if (context?.prevInvoicesQueries) {
        context.prevInvoicesQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
    },
    onSettled: () => {
      api.invalidateCache();
      queryClient.invalidateQueries({ queryKey: ['category_items', 'invoice'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

// Optimistic mutation hook for payment settlement
export function useSettleInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, paymentData }: { id: string; paymentData: any }) => api.migrateToPayment(id, paymentData),
    onMutate: async ({ id, paymentData }) => {
      const isMatch = (inv: any) => inv && (inv.id === id || inv._id === id);

      await queryClient.cancelQueries({ queryKey: ['category_items', 'invoice'] });
      await queryClient.cancelQueries({ queryKey: ['invoices'] });

      const prevCategoryQueries = queryClient.getQueriesData({ queryKey: ['category_items', 'invoice'] });
      const prevInvoicesQueries = queryClient.getQueriesData({ queryKey: ['invoices'] });

      const updateInvoiceWithPayment = (inv: InvoiceRecord): InvoiceRecord => {
        const addedPaid = Number(paymentData.amount || 0);
        const addedDiscount = Number(paymentData.discount || 0);
        const newPaid = (inv.amountPaid || 0) + addedPaid;
        const totalDiscount = (Number(inv.discount) || 0) + addedDiscount;
        const totalAmount = Number(inv.totalAmount) || 0;
        const isFull = Boolean(paymentData.isFullSettlementWithDiscount || (newPaid + totalDiscount) >= totalAmount);
        const newBalance = isFull ? 0 : Math.max(0, totalAmount - newPaid - totalDiscount);

        return {
          ...inv,
          amountPaid: newPaid,
          discount: totalDiscount,
          balanceDue: newBalance,
          status: isFull ? 'Paid' : 'Partial',
          paymentDate: paymentData.date,
          paymentMode: paymentData.mode,
        };
      };

      queryClient.setQueriesData<PaginatedResult<InvoiceRecord>>({ queryKey: ['category_items', 'invoice'] }, (old) => {
        if (!old || !old.items) return old;
        return {
          ...old,
          items: old.items.map((inv) => (isMatch(inv) ? updateInvoiceWithPayment(inv) : inv)),
        };
      });

      queryClient.setQueriesData<InvoiceRecord[]>({ queryKey: ['invoices'] }, (old) => {
        if (!old || !Array.isArray(old)) return old;
        return old.map((inv) => (isMatch(inv) ? updateInvoiceWithPayment(inv) : inv));
      });

      return { prevCategoryQueries, prevInvoicesQueries };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevCategoryQueries) {
        context.prevCategoryQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
      if (context?.prevInvoicesQueries) {
        context.prevInvoicesQueries.forEach(([queryKey, queryData]) => {
          queryClient.setQueryData(queryKey, queryData);
        });
      }
    },
    onSettled: () => {
      api.invalidateCache();
      queryClient.invalidateQueries({ queryKey: ['category_items', 'invoice'] });
      queryClient.invalidateQueries({ queryKey: ['category_items', 'payment'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}
