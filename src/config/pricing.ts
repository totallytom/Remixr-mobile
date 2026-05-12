export const PRICING = {
  monthly: {
    display: '$4.99',
    period: '/month',
    checkoutLabel: '$4.99/mo',
  },
  yearly: {
    display: '$3.99',
    period: '/month',
    total: '$47.99',
    totalLabel: 'billed annually',
    checkoutLabel: '$47.99/yr',
  },
} as const;
