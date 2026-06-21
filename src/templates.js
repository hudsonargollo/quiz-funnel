/**
 * Starter funnel templates, one per type. Each is a full funnel config
 * ({ config, screens }) that gets cloned into a new funnel on creation and is
 * then editable by the tenant. The legacy quiz funnel is seeded separately
 * from the original public/js/quiz-data.js content.
 */

export const TEMPLATES = {
  // ── Quiz: a short starter quiz the tenant expands ──
  quiz: {
    name: 'New quiz funnel',
    config: { productName: 'My Product', productPrice: 9.9, currency: 'EUR' },
    screens: [
      { id: 'landing', type: 'landing',
        headline: 'Discover your', headlineAccent: 'personalized result',
        sub: 'Answer a few quick questions to get your custom plan.',
        alertTitle: 'Limited:', alertBody: 'This assessment is available once per visitor.',
        cta: 'Start' },
      { id: 'q1', type: 'single', key: 'goal', question: 'What do you want to {achieve}?',
        options: [
          { value: 'a', icon: 'target', label: 'Goal A' },
          { value: 'b', icon: 'zap', label: 'Goal B' },
          { value: 'c', icon: 'heart-pulse', label: 'Goal C' },
        ] },
      { id: 'q2', type: 'multi', key: 'interests', question: 'What matters {most}?',
        options: [
          { value: 'x', icon: 'sparkles', label: 'Option X' },
          { value: 'y', icon: 'flame', label: 'Option Y' },
          { value: 'z', icon: 'smile', label: 'Option Z' },
        ] },
      { id: 'name', type: 'text', key: 'nome', question: 'What is your {name}?',
        fields: [{ key: 'nome', label: 'Name', placeholder: 'Your name', type: 'text', required: true }],
        cta: 'Continue' },
      { id: 'email', type: 'text', key: 'email', question: 'Where do we send your {result}?',
        fields: [{ key: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email', required: true }],
        privacyNote: 'We never share your data.', cta: 'See my result', isLeadCapture: true },
      { id: 'offer', type: 'offer' },
    ],
  },

  // ── Lead magnet / opt-in: capture an email, deliver the asset ──
  optin: {
    name: 'New lead magnet',
    config: { productName: 'Free Guide', leadMagnetUrl: '' },
    screens: [
      { id: 'landing', type: 'landing',
        headline: 'Get the free', headlineAccent: 'guide',
        sub: 'Enter your email and we will send it right over.',
        cta: 'Get it free' },
      { id: 'email', type: 'text', key: 'email', question: 'Where should we {send it?}',
        fields: [{ key: 'email', label: 'Email', placeholder: 'you@email.com', type: 'email', required: true }],
        privacyNote: 'No spam. Unsubscribe anytime.', cta: 'Send me the guide', isLeadCapture: true },
      { id: 'thanks', type: 'bridge',
        headline: 'Check your {inbox!}',
        body: 'Your guide is on its way. If you do not see it, check spam.',
        cta: 'Done' },
    ],
  },

  // ── VSL → checkout: video sales letter then offer ──
  vsl: {
    name: 'New VSL funnel',
    config: { productName: 'My Offer', productPrice: 27, currency: 'EUR' },
    screens: [
      { id: 'vsl', type: 'video', key: 'vsl',
        headline: 'Watch this {before you go}',
        videoUrl: '', revealAfter: 0,
        cta: 'Get instant access' },
      { id: 'offer', type: 'offer' },
    ],
  },
};

export function templateFor(type) {
  return TEMPLATES[type] || TEMPLATES.quiz;
}
