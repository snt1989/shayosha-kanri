import React, { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './theme';
import { toNumber } from './logic';

export type Option = { value: string; label: string };
export const toOptions = (list: readonly string[]): Option[] => list.map((v) => ({ value: v, label: v }));

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'warn' | 'danger' }) {
  return <View style={[s.card, tone === 'warn' && s.cardWarn, tone === 'danger' && s.cardDanger]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.heading}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

type PillTone = 'slate' | 'green' | 'amber' | 'red' | 'sky';
const pillBg: Record<PillTone, string> = { slate: C.slate100, green: C.green100, amber: C.amber100, red: C.red100, sky: C.sky100 };
const pillFg: Record<PillTone, string> = { slate: C.slate600, green: C.green600, amber: C.amber600, red: C.red600, sky: C.sky700 };
export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: PillTone }) {
  return (
    <View style={[s.pill, { backgroundColor: pillBg[tone] }]}>
      <Text style={[s.pillText, { color: pillFg[tone] }]}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'default',
  small,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        variant === 'primary' && s.btnPrimary,
        variant === 'danger' && s.btnDanger,
        off && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? C.white : C.slate700} />
      ) : (
        <Text style={[s.btnText, small && s.btnTextSmall, variant === 'primary' && { color: C.white }, variant === 'danger' && { color: C.red600 }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.errorBox} accessibilityRole="alert">
      <Text style={s.errorText}>{message}</Text>
      {onRetry ? <Button title="もう一度読み込む" small onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <Text style={s.muted}>{text}</Text>
    </View>
  );
}

export function Spinner() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color={C.sky600} />
    </View>
  );
}

function FieldFrame({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      {children}
      {hint ? <Text style={[s.muted, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
  autoCapitalize = 'none',
  secureTextEntry,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  secureTextEntry?: boolean;
  hint?: string;
}) {
  return (
    <FieldFrame label={label} hint={hint}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.slate500}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        style={[s.input, multiline && { minHeight: 76, textAlignVertical: 'top' }, !editable && { backgroundColor: C.slate100, color: C.slate500 }]}
      />
    </FieldFrame>
  );
}

// 数の入力。入力の途中（「12.」など）を壊さないよう、文字は内部で持つ。
export function NumberField({
  label,
  value,
  onChange,
  decimal,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  decimal?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    if (toNumber(text) !== value) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <FieldFrame label={label} hint={hint}>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(toNumber(t));
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        placeholderTextColor={C.slate500}
        style={s.input}
      />
    </FieldFrame>
  );
}

export function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={s.switchRow}>
      <Text style={[s.label, { flex: 1, marginBottom: 0, marginRight: 12 }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: C.sky600, false: C.slate300 }} />
    </View>
  );
}

// 選択肢が少ない前提で、押すとその場に一覧を開く（モーダルの上にモーダルを重ねないため）。
export function SelectField({ label, value, options, onChange, placeholder = '選択してください' }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <FieldFrame label={label}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={[s.input, s.select]}>
        <Text style={{ flex: 1, color: current || value ? C.slate800 : C.slate500, fontSize: 15 }} numberOfLines={1}>
          {current ? current.label : value || placeholder}
        </Text>
        <Text style={{ color: C.slate500 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={s.options}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={[s.option, o.value === value && { backgroundColor: C.sky50 }]}
            >
              <Text style={{ color: o.value === value ? C.sky700 : C.slate800, fontWeight: o.value === value ? '700' : '400', fontSize: 15 }}>{o.label}</Text>
            </Pressable>
          ))}
          {options.length === 0 && <Text style={[s.muted, { padding: 12 }]}>選べる項目がありません。</Text>}
        </View>
      )}
    </FieldFrame>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function FormModal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.slate100 }}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle} numberOfLines={1}>
            {title}
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Text style={{ color: C.sky700, fontSize: 15, fontWeight: '600' }}>閉じる</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={s.modalFoot}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.slate100 },
  card: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.slate200, padding: 14, marginBottom: 12 },
  cardWarn: { backgroundColor: C.amber50, borderColor: C.amber100 },
  cardDanger: { backgroundColor: C.red50, borderColor: C.red100 },
  heading: { fontSize: 16, fontWeight: '700', color: C.slate800, marginBottom: 8 },
  muted: { fontSize: 12, color: C.slate500, lineHeight: 18 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: '700' },
  btn: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: C.slate300, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmall: { minHeight: 36, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: C.sky600, borderColor: C.sky600 },
  btnDanger: { backgroundColor: C.red50, borderColor: C.red100 },
  btnText: { fontSize: 15, fontWeight: '600', color: C.slate700 },
  btnTextSmall: { fontSize: 13 },
  errorBox: { backgroundColor: C.red50, borderColor: C.red100, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, gap: 8 },
  errorText: { color: C.red600, fontSize: 13, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '600', color: C.slate700, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.slate300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.slate800, backgroundColor: C.white },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  options: { marginTop: 6, borderWidth: 1, borderColor: C.slate200, borderRadius: 10, backgroundColor: C.white, overflow: 'hidden' },
  option: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.slate200 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, minHeight: 44 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.sky700, backgroundColor: C.sky50, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginTop: 6, marginBottom: 12 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.slate200 },
  modalTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.slate800, marginRight: 12 },
  modalFoot: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.slate200 },
});
