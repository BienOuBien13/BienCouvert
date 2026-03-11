// app/(tabs)/chat.tsx — Écran chat avec l'assistant IA
import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { usePolicies } from '@/hooks/usePolicies';
import { ChatInterface } from '@/components/ChatInterface';
import { Message } from '@/types';

export default function ChatScreen() {
  const { user } = useAuth();
  const { policies, load } = usePolicies(user?.id);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.flex}>
      <ChatInterface
        policies={policies}
        messages={messages}
        setMessages={setMessages}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
