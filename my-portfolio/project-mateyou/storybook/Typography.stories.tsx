import type { Meta, StoryObj } from '@storybook/react'
import { Typography } from '../src/components/Typography'

const meta: Meta<typeof Typography> = {
  title: 'Components/Typography',
  component: Typography,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'subtitle1',
        'subtitle2',
        'body1',
        'body2',
        'caption',
        'overline',
      ],
    },
    color: {
      control: { type: 'select' },
      options: [
        'primary',
        'secondary',
        'success',
        'error',
        'warning',
        'info',
        'text-primary',
        'text-secondary',
        'text-disabled',
      ],
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const H1: Story = {
  args: {
    variant: 'h1',
    children: 'Heading 1',
  },
}

export const H2: Story = {
  args: {
    variant: 'h2',
    children: 'Heading 2',
  },
}

export const H3: Story = {
  args: {
    variant: 'h3',
    children: 'Heading 3',
  },
}

export const H4: Story = {
  args: {
    variant: 'h4',
    children: 'Heading 4',
  },
}

export const H5: Story = {
  args: {
    variant: 'h5',
    children: 'Heading 5',
  },
}

export const H6: Story = {
  args: {
    variant: 'h6',
    children: 'Heading 6',
  },
}

export const Body1: Story = {
  args: {
    variant: 'body1',
    children: '이것은 본문 텍스트입니다. Body1 스타일을 사용합니다.',
  },
}

export const Body2: Story = {
  args: {
    variant: 'body2',
    children: '이것은 더 작은 본문 텍스트입니다. Body2 스타일을 사용합니다.',
  },
}

export const Caption: Story = {
  args: {
    variant: 'caption',
    children: '이것은 캡션 텍스트입니다.',
  },
}

export const AllHeadings: Story = {
  render: () => (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Headings</h3>
        <div className="space-y-1">
          <Typography variant="h1">Heading 1 - 메인 제목</Typography>
          <Typography variant="h2">Heading 2 - 섹션 제목</Typography>
          <Typography variant="h3">Heading 3 - 서브 섹션</Typography>
          <Typography variant="h4">Heading 4 - 작은 제목</Typography>
          <Typography variant="h5">Heading 5 - 더 작은 제목</Typography>
          <Typography variant="h6">Heading 6 - 가장 작은 제목</Typography>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Body Text</h3>
        <div className="space-y-2">
          <Typography variant="body1">
            본문 텍스트 Body1 - 일반적인 본문 내용에 사용됩니다. 읽기 편한
            크기와 간격으로 설정되어 있습니다.
          </Typography>
          <Typography variant="body2">
            본문 텍스트 Body2 - 더 작은 본문 내용이나 부가 설명에 사용됩니다.
          </Typography>
          <Typography variant="caption">
            캡션 텍스트 - 이미지 설명이나 작은 부가 정보에 사용됩니다.
          </Typography>
        </div>
      </div>
    </div>
  ),
}

export const ColorVariants: Story = {
  render: () => (
    <div className="space-y-2 p-6">
      <h3 className="text-lg font-semibold mb-4">Color Variants</h3>
      <Typography color="primary">Primary Color</Typography>
      <Typography color="secondary">Secondary Color</Typography>
      <Typography color="success">Success Color</Typography>
      <Typography color="error">Error Color</Typography>
      <Typography color="warning">Warning Color</Typography>
      <Typography color="text-disabled">Disabled Text</Typography>
    </div>
  ),
}
