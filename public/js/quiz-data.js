/* ============================================
   QUIZ DATA — All questions, bridges, config
   ============================================ */

window.QUIZ_CONFIG = {
  productName: 'Truque da Gelatina',
  productPrice: 9.90,
  currency: 'EUR',
  stripeCheckoutEndpoint: '/api/create-checkout-session',
};

/* Each screen type:
   'landing'   — intro screen
   'single'    — single-select options (auto-advance)
   'multi'     — multi-select + Continuar button
   'slider'    — numeric ruler input
   'text'      — text field input (name, email)
   'bridge'    — content / social proof interstitial
   'profile'   — summary card of collected data
   'imc'       — calculated BMI result screen
   'grid'      — 2-column visual card select (auto-advance)
   'loading'   — animated processing screen
   'offer'     — sales page
*/

window.SCREENS = [

  /* ── 0: LANDING ───────────────────────────── */
  {
    id: 'landing',
    type: 'landing',
    headline: 'O Truque da Gelatina que está a fazer mulheres perder',
    headlineAccent: '7kg em 7 dias',
    sub: 'Responda o quiz de 2 minutos e receba o seu Protocolo Personalizado da Gelatina Barátrica.',
    image: '/images/before-after-hero.jpg',
    imagePlaceholder: 'Imagem antes/depois — Dra. Patricia F.',
    alertTitle: 'Atenção:',
    alertBody: 'Esta avaliação fica disponível apenas uma vez por pessoa. Se sair agora, poderá perder a sua oportunidade.',
    cta: 'Continuar',
  },

  /* ── 1: QUIZ Q1 ───────────────────────────── */
  {
    id: 'q1',
    type: 'single',
    key: 'objetivo',
    question: 'O que quer {realmente mudar} neste momento?',
    options: [
      { value: 'perder_peso', icon: 'trending-down', label: 'Perder peso e reduzir gordura', img: '/images/opt-perder.jpg' },
      { value: 'parar_engordar', icon: 'refresh-cw', label: 'Parar de engordar tudo o que perco', img: '/images/opt-parar.jpg' },
      { value: 'corpo_firme', icon: 'dumbbell', label: 'Voltar a sentir o meu corpo mais firme', img: '/images/opt-firme.jpg' },
    ],
  },

  /* ── 2: QUIZ Q2 ───────────────────────────── */
  {
    id: 'q2',
    type: 'single',
    key: 'sensacao_corpo',
    question: 'Como sente o seu {corpo} neste momento?',
    options: [
      { value: 'gordura_acumulada', icon: 'layers', label: 'Tenho gordura acumulada que não consigo eliminar', img: '/images/body-1.jpg' },
      { value: 'inchar', icon: 'wind', label: 'Tenho tendência a inchar com facilidade', img: '/images/body-2.jpg' },
      { value: 'peso_nao_desce', icon: 'lock', label: 'Mesmo controlando a alimentação, o peso não desce', img: '/images/body-3.jpg' },
      { value: 'metabolismo_lento', icon: 'battery-low', label: 'Sinto que o meu metabolismo está lento', img: '/images/body-4.jpg' },
    ],
  },

  /* ── 3: QUIZ Q3 ───────────────────────────── */
  {
    id: 'q3',
    type: 'multi',
    key: 'zonas_problematicas',
    question: 'Em que {zonas} sente mais dificuldade em {perder gordura?}',
    options: [
      { value: 'barriga', icon: 'target', label: 'Barriga', img: '/images/zona-barriga.jpg' },
      { value: 'ancas', icon: 'target', label: 'Ancas e glúteos', img: '/images/zona-ancas.jpg' },
      { value: 'bracos', icon: 'target', label: 'Braços', img: '/images/zona-bracos.jpg' },
      { value: 'pernas', icon: 'target', label: 'Pernas', img: '/images/zona-pernas.jpg' },
      { value: 'todo_corpo', icon: 'target', label: 'Um pouco por todo o corpo', img: '/images/zona-corpo.jpg' },
    ],
  },

  /* ── 4: QUIZ Q4 ───────────────────────────── */
  {
    id: 'q4',
    type: 'single',
    key: 'impacto_vida',
    question: 'O seu {peso} já está a afetar alguma destas áreas da {sua vida?}',
    options: [
      { value: 'energia', icon: 'battery-low', label: 'Sinto cansaço e falta de energia quase todos os dias' },
      { value: 'autoestima', icon: 'frown', label: 'Sinto-me menos confiante e com a autoestima em baixo' },
      { value: 'saude', icon: 'heart-pulse', label: 'Já começaram a surgir problemas de saúde (tensão, dores, análises alteradas)' },
      { value: 'vida_social', icon: 'users', label: 'Tem afetado a minha vida profissional ou íntima' },
    ],
  },

  /* ── 5: QUIZ Q5 ───────────────────────────── */
  {
    id: 'q5',
    type: 'single',
    key: 'espelho',
    question: 'Se fosse completamente honesta consigo mesma... está {satisfeita} com o que vê ao {espelho?}',
    options: [
      { value: 'nao_incomoda', icon: 'frown', label: 'Não, e isso já me incomoda há algum tempo' },
      { value: 'adiado', icon: 'clock', label: 'Não muito, mas tenho adiado mudar' },
      { value: 'podia_melhor', icon: 'meh', label: 'Em parte, mas sei que podia estar melhor' },
    ],
  },

  /* ── 6: QUIZ Q6 ───────────────────────────── */
  {
    id: 'q6',
    type: 'single',
    key: 'bloqueio',
    question: 'O que sente que tem {travado} os seus {resultados} até agora?',
    options: [
      { value: 'peso_nao_desce', icon: 'anchor', label: 'Mesmo quando tento, o peso não desce' },
      { value: 'fome', icon: 'utensils', label: 'Sinto fome com muita facilidade' },
      { value: 'efeito_ioio', icon: 'refresh-cw', label: 'Emagreço, mas volto sempre ao mesmo peso' },
      { value: 'corpo_nao_responde', icon: 'ban', label: 'Parece que o meu corpo não responde' },
    ],
  },

  /* ── 7: BRIDGE — How Protocol Works ───────── */
  {
    id: 'bridge1',
    type: 'bridge',
    headline: 'O protocolo atua diretamente no {BLOQUEIO} que impede o seu corpo de queimar gordura.',
    body: 'Com apenas 20 minutos por dia, ativa um processo natural que começa a libertar gordura acumulada logo nos primeiros dias.',
    image: '/images/protocolo-diagram.jpg',
    imagePlaceholder: 'Diagrama: Como funciona o Protocolo de Gelatina Barátrica Natural',
    bodyExtra: 'A receita Gelatina Barátrica acelera o seu metabolismo, fazendo ele trabalhar 24 horas por dia e queimar gordura mesmo enquanto você dorme.',
    cta: 'Continuar',
  },

  /* ── 8: QUIZ Q7 ───────────────────────────── */
  {
    id: 'q7',
    type: 'multi',
    key: 'objetivos_vida',
    question: 'O que mais mudaria na {sua vida} se conseguisse {emagrecer?}',
    sub: 'Vamos personalizar a sua fórmula para maximizar os resultados',
    options: [
      { value: 'autoconfianca', icon: 'sparkles', label: 'Olhar ao espelho e sentir-me bem comigo mesma, confiante' },
      { value: 'energia', icon: 'zap', label: 'Ter energia ao longo do dia, sem me sentir exausta' },
      { value: 'roupa', icon: 'shirt', label: 'Vestir a roupa que gosto sem me preocupar com a barriga' },
      { value: 'elogios', icon: 'smile', label: 'Ouvir elogios e sentirem que algo mudou em mim' },
      { value: 'parceiro', icon: 'flame', label: 'Sentir o meu parceiro a olhar para mim com mais desejo' },
      { value: 'movimento', icon: 'footprints', label: 'Fazer coisas simples (correr, agachar, viajar) com conforto' },
    ],
  },

  /* ── 9: BRIDGE — Social Proof + Audio ──────── */
  {
    id: 'bridge2',
    type: 'bridge',
    headline: 'Ouça {atentamente} para saber como receber o {protocolo completo}',
    hasAudio: true,
    audioName: 'Dra. Patricia F.',
    audioDuration: '1:15',
    socialProofImage: '/images/before-after-fernanda.jpg',
    socialProofImagePlaceholder: 'Antes/depois — Fernanda Oliveira 93.3kg → 76.5kg',
    testimonial: {
      name: 'Fernanda Oliveira',
      location: 'Lisboa',
      text: 'Já tinha tentado várias dietas, mas acabava sempre por recuperar o peso. Depois de começar o protocolo de gelatina, senti a diferença logo nas primeiras semanas. Perdi 17kg ao longo do processo e, o mais importante, a minha fome descontrolada diminuiu muito. Pela primeira vez senti que o meu corpo estava finalmente a responder.',
    },
    cta: 'Continuar',
  },

  /* ── 10: SLIDER — Height ────────────────── */
  {
    id: 'q8',
    type: 'slider',
    key: 'altura',
    question: 'Qual é a sua {altura?}',
    unit: 'cm',
    unitAlt: 'pol',
    min: 140, max: 210, default: 162, step: 1,
    minAlt: 55, maxAlt: 83, defaultAlt: 64,
    conversionFactor: 0.393701,
    infoTitle: 'A calcular o seu IMC',
    infoBody: 'Precisamos da sua altura para calcular o seu IMC (Índice de Massa Corporal) e adaptar o protocolo às suas necessidades específicas.',
  },

  /* ── 11: SLIDER — Current Weight ───────── */
  {
    id: 'q9',
    type: 'slider',
    key: 'peso_atual',
    question: 'Qual é o seu {peso} atual?',
    unit: 'kg',
    unitAlt: 'lb',
    min: 40, max: 150, default: 72, step: 1,
    minAlt: 88, maxAlt: 330, defaultAlt: 159,
    conversionFactor: 2.20462,
    infoTitle: 'A calcular o seu IMC',
    infoBody: 'Precisamos do seu peso para calcular o seu IMC (Índice de Massa Corporal) e adaptar o protocolo às suas necessidades específicas.',
  },

  /* ── 12: SLIDER — Target Weight ────────── */
  {
    id: 'q10',
    type: 'slider',
    key: 'peso_objetivo',
    question: 'Qual é o {peso} com que se sentiria bem?',
    sub: 'Esta informação ajuda-nos a definir a orientação ideal para si.',
    unit: 'kg',
    unitAlt: 'lb',
    min: 40, max: 150, default: 60, step: 1,
    minAlt: 88, maxAlt: 330, defaultAlt: 132,
    conversionFactor: 2.20462,
  },

  /* ── 13: TEXT INPUT — Name ───────────────── */
  {
    id: 'q11',
    type: 'text',
    key: 'nome',
    question: 'Antes de lhe mostrar o {resultado}... como se chama?',
    fields: [
      { key: 'nome', label: 'Nome', placeholder: 'Digite o seu nome...', type: 'text', required: true },
    ],
    privacyNote: 'Respeitamos a sua privacidade e tratamos os seus dados com total confidencialidade.',
    cta: 'Continuar',
  },

  /* ── 14: QUIZ Q11 ─────────────────────────── */
  {
    id: 'q12',
    type: 'single',
    key: 'rotina',
    question: 'Como descreveria o seu {dia-a-dia?}',
    sub: 'A sua rotina ajuda-nos a ajustar melhor o protocolo.',
    options: [
      { value: 'sedentaria', icon: 'armchair', label: 'Passo a maior parte do dia sentada', img: '/images/rotina-1.jpg' },
      { value: 'moderada', icon: 'footprints', label: 'Faço algumas pausas ativas ao longo do dia', img: '/images/rotina-2.jpg' },
      { value: 'ativa', icon: 'activity', label: 'Estou de pé ou em movimento grande parte do tempo', img: '/images/rotina-3.jpg' },
    ],
  },

  /* ── 15: QUIZ Q12 ─────────────────────────── */
  {
    id: 'q13',
    type: 'single',
    key: 'sono',
    question: 'Em média, quantas horas {dorme por noite?}',
    infoNote: 'O sono influencia diretamente o metabolismo e o controlo do apetite.',
    options: [
      { value: 'menos5', icon: 'moon', label: 'Menos de 5 horas' },
      { value: '5a6', icon: 'bed', label: 'Entre 5 e 6 horas' },
      { value: '7a8', icon: 'bed-double', label: 'Entre 7 e 8 horas' },
      { value: 'mais8', icon: 'bed-double', label: 'Mais de 8 horas' },
    ],
  },

  /* ── 16: QUIZ Q13 ─────────────────────────── */
  {
    id: 'q14',
    type: 'single',
    key: 'agua',
    question: 'Quanta {água} bebe por dia?',
    sub: 'Uma boa hidratação ajuda o corpo a funcionar de forma mais eficiente.',
    options: [
      { value: '250ml', icon: 'droplet', label: '1 copo (cerca de 250 ml)' },
      { value: '500_1500', icon: 'glass-water', label: 'Entre 2 e 6 copos (0,5 a 1,5 L)' },
      { value: '1750_2000', icon: 'glass-water', label: 'Entre 7 e 8 copos (1,75 a 2 L)' },
      { value: 'mais2l', icon: 'droplets', label: 'Mais de 8 copos (mais de 2 L)' },
      { value: 'cafe_cha', icon: 'coffee', label: 'Quase não bebo água, apenas café ou chá' },
    ],
  },

  /* ── 17: LOADING ─────────────────────────── */
  {
    id: 'loading',
    type: 'loading',
    headline: 'A criar o seu protocolo...',
    steps: [
      'A analisar as suas respostas',
      'A calcular o seu IMC personalizado',
      'A identificar os seus bloqueios',
      'A preparar o protocolo',
    ],
    duration: 3500,
  },

  /* ── 18: PROFILE SUMMARY ─────────────────── */
  {
    id: 'profile',
    type: 'profile',
    headline: 'O seu perfil está pronto',
    cta: 'Continuar',
  },

  /* ── 19: IMC RESULT ──────────────────────── */
  {
    id: 'imc',
    type: 'imc',
    cta: 'Continuar',
  },

  /* ── 20: GRID — Body Goal ────────────────── */
  {
    id: 'q15',
    type: 'grid',
    key: 'tipo_resultado',
    question: 'Que tipo de {resultado} quer ver no seu {corpo?}',
    options: [
      { value: 'definido', label: 'Barriga mais lisa e corpo mais definido', img: '/images/result-definido.jpg' },
      { value: 'leve', label: 'Menos inchaço e corpo mais "leve"', img: '/images/result-leve.jpg' },
    ],
  },

  /* ── 21: BRIDGE — Final Social Proof ───────── */
  {
    id: 'bridge3',
    type: 'bridge',
    headline: 'Protocolo {Gelatina Barátrica} vai transformar o seu corpo — tal como transformou o da {Rosana}',
    image: '/images/before-after-rosana.jpg',
    imagePlaceholder: 'Antes/depois — Rosana Alves (3 fases)',
    testimonial: {
      name: 'Rosana Alves',
      location: 'Braga',
      text: 'Já tinha tentado várias dietas, mas acabava sempre por desistir. Comecei a seguir o protocolo todas as manhãs e senti a diferença logo nas primeiras semanas. Ao longo do processo perdi 15kg e, mais importante, deixei de sentir aquele inchaço constante. Hoje sinto-me muito mais leve e confiante.',
    },
    cta: 'Gerar meu protocolo',
  },

  /* ── 22: TEXT INPUT — Email ─────────────── */
  {
    id: 'q16',
    type: 'text',
    key: 'email',
    question: 'Para onde enviamos o seu {protocolo personalizado?}',
    sub: 'Introduza o seu email para receber acesso imediato.',
    fields: [
      { key: 'email', label: 'Email', placeholder: 'o.seu@email.com', type: 'email', required: true },
    ],
    privacyNote: 'Nunca partilhamos os seus dados. Pode cancelar a qualquer momento.',
    cta: 'Ver o meu protocolo',
    isLeadCapture: true,
  },

  /* ── 23: OFFER / SALES PAGE ─────────────── */
  {
    id: 'offer',
    type: 'offer',
  },
];
