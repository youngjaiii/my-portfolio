import type { Meta, StoryObj } from '@storybook/react'
import { AvatarWithFallback } from '../src/components/Avatar'

const meta: Meta<typeof AvatarWithFallback> = {
  title: 'Components/Avatar',
  component: AvatarWithFallback,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    name: {
      control: { type: 'text' },
    },
    src: {
      control: { type: 'text' },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const WithImage: Story = {
  args: {
    name: '홍길동',
    src: 'https://via.placeholder.com/150x150/4F46E5/FFFFFF?text=HG',
    size: 'md',
  },
}

export const Fallback: Story = {
  args: {
    name: '김철수',
    size: 'md',
  },
}

export const Small: Story = {
  args: {
    name: '박영희',
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    name: '이민수',
    size: 'lg',
  },
}

export const ExtraLarge: Story = {
  args: {
    name: '최수진',
    size: 'xl',
  },
}

export const LongName: Story = {
  args: {
    name: '김수현정미경',
    size: 'md',
  },
}

export const EnglishName: Story = {
  args: {
    name: 'John Doe',
    size: 'md',
  },
}

export const BrokenImage: Story = {
  args: {
    name: '정다혜',
    src: 'https://broken-image-url.jpg',
    size: 'md',
  },
}

export const DifferentSizes: Story = {
  render: () => (
    <div className="flex items-center space-x-4 p-6">
      <div className="text-center">
        <AvatarWithFallback name="홍길동" size="sm" />
        <p className="text-xs mt-2">Small</p>
      </div>
      <div className="text-center">
        <AvatarWithFallback name="김철수" size="md" />
        <p className="text-xs mt-2">Medium</p>
      </div>
      <div className="text-center">
        <AvatarWithFallback name="박영희" size="lg" />
        <p className="text-xs mt-2">Large</p>
      </div>
      <div className="text-center">
        <AvatarWithFallback name="이민수" size="xl" />
        <p className="text-xs mt-2">Extra Large</p>
      </div>
    </div>
  ),
}

export const WithAndWithoutImages: Story = {
  render: () => (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">With Images</h3>
        <div className="flex items-center gap-4">
          <AvatarWithFallback
            name="홍길동"
            src="https://via.placeholder.com/150x150/4F46E5/FFFFFF?text=HG"
            size="md"
          />
          <AvatarWithFallback
            name="정다혜"
            src="https://broken-image-url.jpg"
            size="md"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Fallback Names</h3>
        <div className="flex items-center gap-4">
          <AvatarWithFallback name="김수현정미경" size="md" />
          <AvatarWithFallback name="John Doe" size="md" />
          <AvatarWithFallback name="최수진" size="md" />
        </div>
      </div>
    </div>
  ),
}
