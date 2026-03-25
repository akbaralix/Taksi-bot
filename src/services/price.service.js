export const SUBSCRIPTION_PLANS = {
  tarif1: { title: "1 oylik obuna", amount: 149000, days: 30 },
  tarif2: { title: "1 haftalik obuna", amount: 49000, days: 7 },
  tarif3: { title: "1 kunlik obuna", amount: 9000, days: 1 },
};

export function findPlanByAmount(amount) {
  return Object.values(SUBSCRIPTION_PLANS).find((item) => item.amount === amount);
}
