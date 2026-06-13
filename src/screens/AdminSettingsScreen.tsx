import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTestMode } from '../context/TestModeContext';
import { t } from '../i18n/strings';
import { RootScreenProps } from '../navigation/types';
import {
  clearStreamConfig,
  loadStreamConfig,
  saveStreamConfig,
} from '../storage/streamConfigStore';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Admin settings:
 * - "*6" activation code entry (toggles the local test-mode flag).
 * - Licensed stream configuration: provider, URL and token to be filled
 *   in once a broadcast agreement (e.g. with beIN SPORTS) is in place.
 */
export function AdminSettingsScreen(_props: RootScreenProps<'AdminSettings'>) {
  const { enabled: testMode, applyCode } = useTestMode();

  const [code, setCode] = useState('');
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);

  const [provider, setProvider] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [notes, setNotes] = useState('');
  const [configuredProvider, setConfiguredProvider] = useState<string | null>(null);
  const [streamFeedback, setStreamFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadStreamConfig().then((config) => {
      if (!config) return;
      setProvider(config.provider);
      setUrl(config.url);
      setToken(config.token ?? '');
      setNotes(config.notes ?? '');
      setConfiguredProvider(config.provider);
    });
  }, []);

  const onApplyCode = () => {
    const result = applyCode(code);
    setCode('');
    setCodeFeedback(
      result === 'enabled'
        ? t.codeEnabled
        : result === 'disabled'
          ? t.codeDisabled
          : t.codeInvalid,
    );
  };

  const onSaveStream = async () => {
    const cleanUrl = url.trim();
    if (!/^https?:\/\/.+/i.test(cleanUrl)) {
      setStreamFeedback(t.invalidUrl);
      return;
    }
    const saved = await saveStreamConfig({
      provider: provider.trim() || t.providerPlaceholder,
      url: cleanUrl,
      token: token.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setConfiguredProvider(saved.provider);
    setStreamFeedback(t.streamSaved);
  };

  const onClearStream = () => {
    Alert.alert(t.clearStream, t.streamCleared, [
      { text: '❌', style: 'cancel' },
      {
        text: '✅',
        style: 'destructive',
        onPress: async () => {
          await clearStreamConfig();
          setProvider('');
          setUrl('');
          setToken('');
          setNotes('');
          setConfiguredProvider(null);
          setStreamFeedback(t.streamCleared);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* *6 activation code */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.codeSectionTitle}</Text>
          <Text style={styles.hint}>{t.codeHint}</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setCodeFeedback(null);
              }}
              placeholder={t.codePlaceholder}
              placeholderTextColor={colors.locked}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={onApplyCode}
            />
            <Pressable
              style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}
              onPress={onApplyCode}
              accessibilityRole="button"
            >
              <Text style={styles.applyButtonText}>{t.codeApply}</Text>
            </Pressable>
          </View>
          <Text style={styles.feedback}>
            {codeFeedback ?? (testMode ? t.testModeOn : t.testModeOff)}
          </Text>
        </View>

        {/* Licensed stream configuration */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.streamSectionTitle}</Text>
          <Text style={styles.hint}>{t.streamHint}</Text>

          <Text style={styles.statusLine}>
            {configuredProvider
              ? t.streamConfiguredAs(configuredProvider)
              : t.streamNotConfigured}
          </Text>

          <Text style={styles.label}>{t.providerLabel}</Text>
          <TextInput
            style={styles.input}
            value={provider}
            onChangeText={setProvider}
            placeholder={t.providerPlaceholder}
            placeholderTextColor={colors.locked}
            autoCorrect={false}
          />

          <Text style={styles.label}>{t.urlLabel}</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setStreamFeedback(null);
            }}
            placeholder={t.urlPlaceholder}
            placeholderTextColor={colors.locked}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>{t.tokenLabel}</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder={t.tokenPlaceholder}
            placeholderTextColor={colors.locked}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Text style={styles.label}>{t.notesLabel}</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t.notesPlaceholder}
            placeholderTextColor={colors.locked}
            multiline
          />

          {streamFeedback && <Text style={styles.feedback}>{streamFeedback}</Text>}

          <Pressable
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            onPress={onSaveStream}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>{t.saveStream}</Text>
          </Pressable>
          {configuredProvider && (
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              onPress={onClearStream}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>{t.clearStream}</Text>
            </Pressable>
          )}

          <Text style={styles.legal}>{t.adminLegal}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: font.heading,
    fontWeight: '800',
    textAlign: 'right',
  },
  hint: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  codeRow: {
    flexDirection: 'row-reverse',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  codeInput: {
    backgroundColor: colors.background,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: font.heading,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    opacity: 0.8,
  },
  applyButtonText: {
    color: colors.accentDark,
    fontSize: font.body,
    fontWeight: '800',
  },
  feedback: {
    color: colors.textMuted,
    fontSize: font.small,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  statusLine: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'right',
  },
  label: {
    color: colors.text,
    fontSize: font.small,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.lg,
    textAlign: 'right',
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: font.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: 'right',
  },
  notesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.lg,
    padding: spacing.lg,
  },
  saveButtonText: {
    color: colors.accentDark,
    fontSize: font.body,
    fontWeight: '900',
  },
  clearButton: {
    alignItems: 'center',
    borderColor: colors.live,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  clearButtonText: {
    color: colors.live,
    fontSize: font.body,
    fontWeight: '700',
  },
  legal: {
    color: colors.locked,
    fontSize: font.tiny,
    lineHeight: 16,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
