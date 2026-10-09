import * as React from 'react'

import { Img,
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso ao {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://metrixcrm.com.br/__l5e/assets-v1/d704768e-72e1-4139-a5e8-57e2261d0d54/metrix-logo.png" alt={siteName} width="140" height="40" style={{ margin: "0 0 24px", display: "block" }} />
        <Heading style={h1}>Seu link de acesso</Heading>
        <Text style={text}>
          Clique no botão abaixo para acessar sua conta no {siteName}. Este link expira em breve.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Entrar
        </Button>
        <Text style={footer}>
          Se você não solicitou este link, pode ignorar este e-mail com segurança.
        </Text>
        <Img src="https://metrixcrm.com.br/__l5e/assets-v1/4bfe1e97-a38d-45bf-af4a-f5547995e55b/metrix-mascot.png" alt="Metrix mascote" width="120" style={{ margin: '32px auto 8px', display: 'block' }} />
        <Text style={{ ...footer, textAlign: 'center', margin: '0 0 4px' }}>Time Metrix CRM 🦉</Text>
        <Text style={footer}>© {new Date().getFullYear()} {siteName}</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '520px' }
const brand = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#0B22FE',
  margin: '0 0 24px',
  letterSpacing: '-0.02em',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0F172A',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#0B22FE',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '24px 0 0' }
