-- 0006_milestones.sql
-- Internal project-management module: milestones/tasks for the Tektone Funnels
-- product roadmap itself (not client funnels), plus viewer accounts for
-- jorge/pedro/alison who can view + comment but not edit tasks.
-- Additive only.

-- ── Viewer users (same tenant as hudson — internal team, not a client account) ──
INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES
  ('usr_b9208d4fe56468323486c1ee730ac302', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'jorge@tektone.com.br', 'pbkdf2$100000$hKmuXJ5aSuWuUD56wFrrGg==$K8Wbwklz9VX7lUQHThMX+zMRGCayywshBXZZMY5JftI=', 'viewer', '2026-07-02T12:00:00.000Z'),
  ('usr_1795b7debd41471f19e5e1f843803a8e', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'pedrosilvestrini@tektone.com.br', 'pbkdf2$100000$+C3+Lf/t//WHftB/yVSoxg==$+INJ7WXGVbQIglpUzVp2ZUAO2OFnaXQ64L+GWndIKko=', 'viewer', '2026-07-02T12:00:00.000Z'),
  ('usr_d1d2c102e317a6e31dbbe057852c09ee', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'alison@tektone.com.br', 'pbkdf2$100000$ElmRzjIz2g94h7bj3StMvA==$UAi70tmkE3b6tC+2i2espR9zXiyjN9+82QIAEJzwFqU=', 'viewer', '2026-07-02T12:00:00.000Z');

-- ── Schema ──
CREATE TABLE IF NOT EXISTS milestones (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  slug          TEXT NOT NULL,
  order_index   INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  timeline      TEXT,
  objective     TEXT,
  deliverable   TEXT,
  icon          TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_milestones_slug ON milestones(account_id, slug);
CREATE INDEX IF NOT EXISTS idx_milestones_account ON milestones(account_id);

CREATE TABLE IF NOT EXISTS milestone_tasks (
  id            TEXT PRIMARY KEY,
  milestone_id  TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  order_index   INTEGER NOT NULL DEFAULT 0,
  done          INTEGER NOT NULL DEFAULT 0,
  done_at       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mtasks_milestone ON milestone_tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_mtasks_account ON milestone_tasks(account_id);

CREATE TABLE IF NOT EXISTS milestone_comments (
  id            TEXT PRIMARY KEY,
  milestone_id  TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  user_email    TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcomments_milestone ON milestone_comments(milestone_id);

-- ── Seed: Tektone Funnels 8-week roadmap (4 milestones, 25 tasks) ──
INSERT INTO milestones (id, account_id, slug, order_index, title, timeline, objective, deliverable, icon, created_at, updated_at) VALUES
  ('m1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'milestone01', 1, 'Core Funcional (MVP)', 'Semanas 1 e 2',
   'Entregar uma plataforma interna estável para construir um funil, adicionar links de checkout e rastrear métricas básicas.',
   'MVP totalmente funcional pronto para testes beta internos com ofertas reais.', 'layout-dashboard', '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'milestone02', 2, 'Automação com IA', 'Semanas 3 e 4',
   'Integrar IA personalizada para gerar copy e criativos com base na metodologia interna da Tektone.',
   'Motor de IA ativo reduzindo o tempo de criação de copy e ideação de criativos.', 'box', '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'milestone03', 3, 'Mineração de Produtos', 'Semanas 5 e 6',
   'Eliminar ferramentas externas de espionagem centralizando a descoberta de produtos e inspiração de anúncios.',
   'Ecossistema interno de mineração de ponta a ponta alimentando diretamente a criação de funis.', 'target', '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'milestone04', 4, 'Tráfego e Métricas Avançadas', 'Semanas 7 e 8',
   'Sincronizar Meta Ads para rastreamento centralizado e finalizar a arquitetura estável pronta para SaaS.',
   'A plataforma abrangente Tektone Funnels v1.0, totalmente implantada e operacional.', 'trending-up', '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z');

INSERT INTO milestone_tasks (id, milestone_id, account_id, category, title, order_index, done, created_at, updated_at) VALUES
  ('m1-t1', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Infraestrutura', 'Implantar autenticação multiusuário com acesso baseado em funções.', 1, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t2', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Infraestrutura', 'Configurar esquema do banco de dados e geração de URLs públicas exclusivas.', 2, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t3', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Dashboard e Fluxo', 'Construir Dashboard de Funis (Criar, Ler, Atualizar, Deletar, Duplicar).', 3, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t4', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Dashboard e Fluxo', 'Desenvolver assistente de criação de funil (Quiz, VSL, Página de Vendas).', 4, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t5', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Editor Visual', 'Integrar editor visual de páginas/quiz para texto, headlines e imagens.', 5, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t6', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Editor Visual', 'Implementar botões de CTA com campos para link de checkout/produto.', 6, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m1-t7', 'm1', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Rastreamento', 'Configurar rastreamento de eventos básicos (Visualizações, Leads, Cliques no Checkout).', 7, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),

  ('m2-t1', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Motor de Copywriting', 'Integrar API do LLM (OpenAI/Claude) no backend.', 1, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2-t2', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Motor de Copywriting', 'Programar prompts do sistema usando os frameworks de copy do Alisson.', 2, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2-t3', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Motor de Copywriting', 'Habilitar geração em 1 clique de headlines, bullets e fluxos de quiz.', 3, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2-t4', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Geração de Criativos', 'Construir fluxo automatizado para gerar 10 variações de criativos por oferta.', 4, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2-t5', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Geração de Criativos', 'Criar a "Biblioteca de Criativos" por funil (Salvar, Editar, Exportar).', 5, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m2-t6', 'm2', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Geração de Criativos', 'Construir funcionalidade de exportação para editores de vídeo/designers.', 6, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),

  ('m3-t1', 'm3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Módulo de Mineração', 'Construir interface de busca, filtros e categorização.', 1, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m3-t2', 'm3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Módulo de Mineração', 'Desenvolver sistema de "Favoritos" para organizar produtos em potencial.', 2, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m3-t3', 'm3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Módulo de Mineração', 'Implementar "Transformar em Funil com 1 Clique" conectando ao fluxo do Marco 1.', 3, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m3-t4', 'm3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Inspiração de Anúncios', 'Conectar APIs/Ferramentas de scraping para integração com a Biblioteca de Anúncios da Meta.', 4, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m3-t5', 'm3', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Inspiração de Anúncios', 'Construir um moodboard/swipe file visual para criativos de concorrentes.', 5, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),

  ('m4-t1', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Integração Meta Ads', 'Implementar Facebook OAuth para conexão segura da Conta de Anúncios.', 1, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t2', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Integração Meta Ads', 'Extrair dados principais de campanha (Gasto, CPC, CPM, CTR) via API de Marketing.', 2, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t3', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Integração Meta Ads', 'Mapear campanhas ativas para funis específicos da Tektone.', 3, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t4', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Métricas Globais', 'Finalizar o dashboard unificado de métricas (Leads, Compras, CVR).', 4, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t5', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Métricas Globais', 'Implementar gráficos visuais para performance de criativos e funis.', 5, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t6', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Refinamento do Sistema', 'Realizar revisão de código para garantir escalabilidade SaaS multi-tenant.', 6, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z'),
  ('m4-t7', 'm4', 'acc_f9c2edeab6fe009b87960bd808a16d1d', 'Refinamento do Sistema', 'Correção final de bugs e refinamento de UI/UX.', 7, 0, '2026-07-02T12:00:00.000Z', '2026-07-02T12:00:00.000Z');
