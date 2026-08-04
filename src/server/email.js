// Único arquivo que conhece o provedor de e-mail. Usa a API HTTP da Brevo
// (sem SMTP, sem domínio próprio — só verificar um e-mail remetente em
// app.brevo.com/senders). Trocar de provedor de novo não afeta o resto do servidor.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NOME = 'Arena PVP';

// Sem credenciais configuradas (ex.: rodando testes locais), loga no console
// em vez de quebrar — o fluxo de auth continua utilizável em desenvolvimento.
async function enviar({ to, subject, html, text }) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    console.warn(`[email] BREVO_API_KEY/BREVO_SENDER_EMAIL não configurados. E-mail para ${to}: ${subject}\n${text}`);
    return;
  }
  const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: BREVO_SENDER_NOME, email: BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`[email] falha ao enviar via Brevo (${resposta.status}): ${corpo}`);
  }
  console.log(`[email] enviado para ${to}: ${subject}`);
}

function layout({ titulo, mensagem, textoBotao, url }) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#e6e6e6;background:#15161c;border-radius:12px">
  <h1 style="margin:0 0 16px;font-size:22px;color:#fff">${titulo}</h1>
  <p style="margin:0 0 24px;line-height:1.6;color:#b9bcc8">${mensagem}</p>
  <a href="${url}" style="display:inline-block;padding:12px 24px;background:#5b6cff;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${textoBotao}</a>
  <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#7a7e8c">Se o botão não funcionar, copie e cole este link no navegador:<br>${url}</p>
  <p style="margin:16px 0 0;font-size:12px;color:#7a7e8c">Se você não fez essa solicitação, pode ignorar este e-mail.</p>
</div>`;
}

export async function enviarVerificacaoEmail({ to, url }) {
  await enviar({
    to,
    subject: 'Confirme seu e-mail — Arena PVP',
    text: `Confirme seu e-mail para ativar sua conta no Arena PVP: ${url}`,
    html: layout({
      titulo: 'Confirme seu e-mail',
      mensagem: 'Falta pouco para entrar na arena! Confirme seu e-mail para ativar sua conta.',
      textoBotao: 'Confirmar e-mail',
      url,
    }),
  });
}

export async function enviarResetSenha({ to, url }) {
  await enviar({
    to,
    subject: 'Redefinir sua senha — Arena PVP',
    text: `Use este link para criar uma nova senha no Arena PVP (expira em 1 hora): ${url}`,
    html: layout({
      titulo: 'Redefinir sua senha',
      mensagem: 'Recebemos um pedido para redefinir sua senha. O link abaixo expira em 1 hora.',
      textoBotao: 'Criar nova senha',
      url,
    }),
  });
}
