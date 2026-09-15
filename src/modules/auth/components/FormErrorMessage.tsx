import { Text } from 'react-native';

interface FormErrorMessageProps {
  message: string | null;
}

export const FormErrorMessage = ({ message }: FormErrorMessageProps) =>
  message === null ? null : (
    <Text className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger">{message}</Text>
  );
